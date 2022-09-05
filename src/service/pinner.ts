import {FileType, IPFSFileType, Pin, PinFileAnalysisStatus, PinFilePinStatus, PinStatus} from "../type/pinner";
import {Deleted, Valid} from "../type/common";
import {PinObject} from "../dao/PinObject";
import {fromDecimal, sleep, uuid} from "../util/common";
import {CONFIGS} from "../config";
import {Transaction} from "sequelize";
import sequelize from "../db/mysql";
import {Gateway} from "../dao/Gateway";
import {IPFSApi} from "./ipfs";
import {PinFile} from "../dao/PinFile";
import {BillingPlan} from "../dao/BillingPlan";
import BigNumber from "bignumber.js";
import {defaultLogger, logger} from "../util/logger";
import {checkingAccountBalance, getOrderState, placeOrder} from "./crust/order";
import {sendDinkTalkMsg} from "../util/dinktalk";
import createKeyring from './crust/krp';
import {api} from "./crust/api";
import {KeyringPair} from "@polkadot/keyring/types";
import {Logger} from "winston";
import {PinFolderFile} from "../dao/PinFolderFile";
import {PinObjectGateway} from "../dao/PinObjectGateway";

const dayjs = require("dayjs");
const moment = require('moment');
const _ = require('lodash');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

export async function deleteByRequestId(userId: number, apikeyId: number, requestId: string) {
    const existObj = await PinObject.model.findOne({
        attributes: ['id', 'cid', 'deleted'],
        where: {
            api_key_id: apikeyId,
            request_id: requestId
        }
    });
    if (!_.isEmpty(existObj) && existObj.deleted === Deleted.undeleted) {
        const pinFile = await PinFile.model.findOne({
            attributes: ['file_size'],
            where: {
                cid: existObj.cid
            }
        });
        await sequelize.transaction(async (transaction: Transaction) => {
            await PinObject.model.update({
                deleted: Deleted.deleted,
                update_time: moment().format('YYYY-MM-DD HH:mm:ss')
            }, {
                where: {
                    id: existObj.id
                },
                transaction
            });
            // Add pinObject lock (only lock one row)
            const unDeletedObj = await PinObject.model.findOne({
                attributes: ['id'],
                lock: transaction.LOCK.UPDATE,
                where: {
                    cid: existObj.cid,
                    deleted: Deleted.undeleted,
                    id: {
                        [Op.ne]: existObj.id
                    }
                },
                order: [
                    ['id', 'asc']
                ],
                limit: 1,
                transaction
            });
            if (_.isEmpty(unDeletedObj)) {
                await PinFile.model.update({
                    deleted: Deleted.deleted,
                    update_time: moment().format('YYYY-MM-DD HH:mm:ss')
                }, {
                    where: {
                        cid: existObj.cid
                    },
                    transaction
                });
            }
            // Add billing_plan lock
            const userPlan = await BillingPlan.model.findOne({
                attributes: ['id', 'used_storage_size'],
                lock: transaction.LOCK.UPDATE,
                where: {
                    user_id: userId
                },
                transaction
            });
            await BillingPlan.model.update({
                used_storage_size: new BigNumber(userPlan.used_storage_size).minus(pinFile.file_size).toString()
            }, {
                where: {
                    user_id: userId
                },
                transaction
            });
        });
    }
}

export async function replacePin(
    apikeyId: number,
    userId: number,
    requestId: string,
    pin: Pin
): Promise<PinStatus> {
    await deleteByRequestId(userId, apikeyId, requestId);
    return pinByCid(userId, apikeyId, pin);
}

export async function pinByCid(userId: number, apikeyId: number, pin: Pin): Promise<PinStatus> {
    let existPinObject = await PinObject.model.findOne({
        where: {api_key_id: apikeyId, cid: pin.cid},
    });
    const existPinFile = await PinFile.model.findOne({
        where: {
            cid: pin.cid
        }
    });
    let gateway = await Gateway.model.findOne({
        where: {
            id: _.get(pin, 'meta.gatewayId', 0),
            valid: Valid.valid
        }
    });
    if (!_.isEmpty(existPinObject) && !_.isEmpty(existPinFile) && existPinObject.deleted === Deleted.undeleted) {
        if (!_.isEmpty(gateway)) {
            const pg = await PinObjectGateway.model.findOne({
                attributes: ['pin_object_id', 'gateway_id'],
                where: {
                    pin_object_id: existPinObject.id,
                    gateway_id: gateway.id
                }
            });
            if (_.isEmpty(pg)) {
                await PinObjectGateway.model.create({
                    pin_object_id: existPinObject.id,
                    gateway_id: gateway.id,
                    update_time: dayjs().format('YYYY-MM-DD HH:mm:ss')
                }, {
                    ignoreDuplicates: false,
                    updateOnDuplicate: [
                        'pin_object_id',
                        'gateway_id',
                        'update_time'
                    ],
                })
            }
        }
        const data = {
            ...existPinObject.dataValues,
            status: existPinFile.pin_status
        };
        const result = PinStatus.parseBaseData(data);
        return result;
    }
    let fileType = !_.isEmpty(existPinFile) ? existPinFile.file_type : FileType.file;
    let fileSize = !_.isEmpty(existPinFile) ? existPinFile.file_size : 0;
    if (_.isEmpty(gateway)) {
        gateway = !_.isEmpty(gateway) ? gateway : (await Gateway.queryGatewayHostByApiKeyId(userId));
    }
    if (_.isEmpty(existPinFile)) {
        const fileStat = await new IPFSApi(gateway.host).fileStat(pin.cid);
        fileType = fileStat.Type === 'file' ? FileType.file : FileType.folder;
        fileSize = fileStat.CumulativeSize;
    }
    const pinObj = {
        name: pin.name ? pin.name : pin.cid,
        request_id: uuid(),
        api_key_id: apikeyId,
        cid: pin.cid,
        meta: pin.meta,
        delegates: CONFIGS.ipfs.delegates.join(','),
        origins: [...pin.origins].join(','),
        deleted: Deleted.undeleted,
        update_time: dayjs().format('YYYY-MM-DD HH:mm:ss')
    };
    const pinFile = {
        cid: pin.cid,
        pin_status: PinFilePinStatus.queued,
        file_type: _.isEmpty(existPinFile) ? fileType : existPinFile.file_type,
        analysis_status: fileType === FileType.file ? PinFileAnalysisStatus.finished : PinFileAnalysisStatus.unfinished,
        order_retry_times: 0,
        file_size: fileSize,
        calculated_at: 0,
        expired_at: 0,
        replica_count: 0,
        deleted: Deleted.undeleted,
        update_time: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    const resetPinFile = _.isEmpty(existPinFile) ? false : existPinFile.deleted === Deleted.deleted;
    const pinStatus = (_.isEmpty(existPinFile) || resetPinFile) ? PinFilePinStatus.queued : pinFile.pin_status;
    await sequelize.transaction(async (transaction: Transaction) => {
        // Add billing_plan lock
        const userPlan = await BillingPlan.model.findOne({
            attributes: ['id', 'used_storage_size', 'max_storage_size', 'storage_expire_time'],
            lock: transaction.LOCK.UPDATE,
            where: {
                user_id: userId
            },
            transaction
        });
        if (new BigNumber(userPlan.used_storage_size).plus(fileSize).comparedTo(userPlan.max_storage_size) > 0 || dayjs(userPlan.storage_expire_time).isBefore(dayjs())) {
            throw new Error('Billing Plan out of limit');
        }
        await BillingPlan.model.update({
            used_storage_size: new BigNumber(userPlan.used_storage_size).plus(pinFile.file_size).toString()
        }, {
            where: {
                user_id: userId
            },
            transaction
        });
        if (_.isEmpty(existPinFile)) {
            await PinFile.model.create(pinFile, {transaction})
        } else if (resetPinFile) {
            await PinFile.model.update(pinFile, {
                where: {
                    id: existPinFile.id
                },
                transaction
            })
        }
        if (_.isEmpty(existPinObject)) {
            existPinObject = await PinObject.model.create(pinObj, {transaction});
        } else {
            await PinObject.model.update(pinObj, {
                where: {
                    id: existPinObject.id
                },
                transaction
            })
        }
        await PinObjectGateway.model.create({
            pin_object_id: existPinObject.id,
            gateway_id: gateway.id,
            update_time: dayjs().format('YYYY-MM-DD HH:mm:ss')
        }, {
            ignoreDuplicates: false,
            updateOnDuplicate: [
                'pin_object_id',
                'gateway_id',
                'update_time'
            ],
            transaction
        })
    });
    return PinStatus.parseBaseData({
        ...existPinObject,
        ...pinObj,
        status: pinStatus
    });
}

export async function analysisPinFolderFiles() {
    const logger = defaultLogger(`analysis-folder`);
    while (true) {
        try {
            const folders = await PinFile.model.findAll({
                attributes: ['id', 'cid'],
                where: {
                    deleted: Deleted.undeleted,
                    analysis_status: PinFileAnalysisStatus.unfinished,
                    file_type: FileType.folder
                },
                order: [['id', 'asc']],
                limit: 30
            });
            if (_.isEmpty(folders)) {
                await sleep(500);
                continue;
            }
            const chunk = _.chunk(folders, CONFIGS.pin.folderAnalysisThreadSize as number);
            await Promise.all(_.map(chunk, async (files: any) => {
                for (const f of files) {
                    await analysisFolder(f.cid, f.id, logger);
                }
            })).catch(e => {
                logger.error(`Analysis chunk folders err: ${e.stack}`);
            })
        } catch (e) {
            logger.error(`Analysis folders err: ${e.stack}`);
            await sleep(1000);
        }
    }
}

async function analysisFolder(cid: string, fileId: number, logger: Logger) {
    try {
        const host = await Gateway.queryGatewayHostByCid(cid);
        const allFilesInFolder = await IPFSApi.refs(cid, host);
        const childCid = _.concat([cid], _.map(allFilesInFolder, (i: any) => `${i.Ref}`));
        const allChildStat = await IPFSApi.fileLs(childCid, host);
        const childFileMap = new Map<string, ChildFileStat>();
        _.each(allChildStat.Objects, (i: any) => {
            _.each(i.Links, (f: any) => {
                childFileMap.set(f.Hash, {
                    cid: f.Hash,
                    size: f.Size,
                    type: f.Type === IPFSFileType.folder ? FileType.folder : FileType.file
                })
            })
        });
        for (const f of childFileMap.values()) {
            await PinFolderFile.model.findOrCreate( {
                defaults: {
                    pin_file_id: fileId,
                    cid: f.cid,
                    file_size: f.size,
                    file_type: f.type
                },
                where: {
                    pin_file_id: fileId,
                    cid: f.cid
                }
            });
        }
        await PinFile.model.update({
            analysis_status: PinFileAnalysisStatus.finished
        },{
            where: {
                id: fileId
            }
        });
    } catch (e) {
        logger.error(`Analysis Folder failed: ${e.stack}`);
    }
}

interface ChildFileStat {
    cid: string,
    size: string,
    type: FileType
}

export async function orderFiles() {
    const logger = defaultLogger(`file-order`);
    while(true) {
        try {
            let pinFiles = await PinFile.model.findAll({
                where: {
                    pin_status: PinFilePinStatus.queued,
                    deleted: Deleted.undeleted
                },
                order: [['id', 'ASC']],
                limit: 1000
            });
            if (_.isEmpty(pinFiles)) {
                await sleep(1000 * 6);
                continue;
            }
            await api.isReadyOrError
            const seedList = (CONFIGS.crust.seed as string).split(',');
            const chunkList = _.chunk(pinFiles, 2);
            await Promise.all(_.map(seedList, async (seedBase64: string, i: number) => {
                if (chunkList[i]) {
                    const seed = Buffer.from(seedBase64, 'base64').toString();
                    const krp = createKeyring(seed);
                    await sleep(1000 * 2);
                    const balanceCheck = await checkingAccountBalance(seed);
                    if (balanceCheck) {
                        for (const file of chunkList[i]) {
                            logger.debug(`Place order file: ${file.cid} by ${krp.address}`)
                            await placeOrderFile(file, krp, logger);
                            await sleep(CONFIGS.crust.orderTimeAwait as number);
                        }
                    }
                }
            })).catch((e) => {
                logger.error(`Batch order files failed: ${e.stack}`)
            });
            await sleep(1000 * 6);
        } catch (e) {
            logger.error(`Place order files failed will retry in 3 seconds: ${e.stack}`)
            await sleep(1000 * 3);
        }
    }
}

async function placeOrderFile(file: any, krp: KeyringPair, logger: Logger) {
    let orderFailed = false;
    try {
        await placeOrder(
            krp,
            file.cid,
            file.file_size,
            fromDecimal(CONFIGS.crust.tips).toFixed(0),
            undefined
        );
    } catch (e) {
        logger.error(`Place order file: ${file.cid} failed: ${e.stack}`);
        await sleep(CONFIGS.crust.orderTimeAwait as number);
        orderFailed = true;
    } finally {
        const retryTime = orderFailed ? (file.order_retry_times + 1) : file.order_retry_times;
        const pinFailed = retryTime >= CONFIGS.crust.orderRetryTimes;
        const pinStatus = pinFailed ? PinFilePinStatus.failed : (orderFailed ? PinFilePinStatus.queued : PinFilePinStatus.pinning);
        if (pinFailed) {
            await sendDinkTalkMsg(`${CONFIGS.common.project_name}(${CONFIGS.common.env}) pin file failed`,
                `### ${CONFIGS.common.project_name}(${CONFIGS.common.env}) \n pin file failed \n Pin file(${file.cid}) failed more then retry times(${CONFIGS.crust.orderRetryTimes}), please check and requeue`);
        }
        await PinFile.model.update({
            pin_status: pinStatus,
            order_retry_times: retryTime
        }, {
            where: {
                id: file.id
            }
        });
    }

}

export async function updatePinFileStatus() {
    const logger = defaultLogger(`file-status-updater`);
    while (true) {
        try {
            const pinFiles = await PinFile.model.findAll({
                where: {
                    pin_status: PinFilePinStatus.pinning,
                    deleted: Deleted.undeleted
                },
                order: [['id', 'ASC']],
                limit: 1000
            });
            if (_.isEmpty(pinFiles)) {
                await sleep(1000 * 6);
                continue;
            }
            for (const file of pinFiles) {
                const fileState = await getOrderState(file.cid);
                if (!_.isEmpty(fileState) && fileState.meaningfulData.reported_replica_count >= CONFIGS.crust.validFileSize) {
                    await PinFile.model.update({
                        calculated_at: fileState.meaningfulData.calculated_at,
                        expired_at: fileState.meaningfulData.expired_at,
                        replica_count: fileState.meaningfulData.reported_replica_count,
                        pin_status: PinFilePinStatus.pinned,
                        update_time: dayjs().format('YYYY-MM-DD HH:mm:ss')
                    }, {
                        where: {
                            id: file.id
                        }
                    });
                }
                await sleep(50);
            }
        } catch (e) {
            logger.error(`Pin file err: ${e.stack}`);
        }
        await sleep(1000);
    }
}

export async function reOrderExpiringFiles() {
    while (true) {
        try {
            await api.isReadyOrError;
            const hash = await api.rpc.chain.getFinalizedHead();
            const block = await api.rpc.chain.getBlock(hash);
            const finalizeBlock = block.block.header.number.toNumber();
            const expireBlock = finalizeBlock + (CONFIGS.crust.blockNumberForExpireOrder as number);
            const expireFiles = await PinFile.model.findAll({
                where: {
                    deleted: Deleted.undeleted,
                    pin_status: PinFilePinStatus.pinned,
                    expired_at: {
                        [Op.lt]: expireBlock
                    }
                },
                order: [['id', 'asc']],
                limit: 1000
            });
            if (_.isEmpty(expireFiles)) {
                await sleep(6 * 1000);
                continue;
            }
            for (const f of expireFiles) {
                const res = await getOrderState(f.cid);
                await PinFile.model.update(_.isEmpty(res) ||(res.meaningfulData.expired_at <= expireBlock) ? {
                    pin_status: PinFilePinStatus.queued,
                    order_retry_times: 0,
                } : {
                    pin_status: PinFilePinStatus.queued,
                    order_retry_times: 0,
                    expired_at: res.meaningfulData.expired_at
                },{
                    where: {
                        id: f.id
                    }
                });
                await sleep(100);
            }
        } catch (e) {
            logger.error(`queued expire file failed ${e.stack}`);
            await sendDinkTalkMsg('queued expire file failed', `${CONFIGS.common.project_name}(${CONFIGS.common.env})queued expire file failed(restart 60 seconds)`);
            await sleep(60 * 1000);
        }
    }
}

export async function pinJobs() {
    const fileStatusJob = updatePinFileStatus();
    const orderFilesJob = orderFiles();
    const reOrderJob = reOrderExpiringFiles();
    const analysisFolderJob = analysisPinFolderFiles();
    const jobs = [fileStatusJob, orderFilesJob, analysisFolderJob, reOrderJob];
    return Promise.all(jobs).catch(e => {
        sendDinkTalkMsg(`${CONFIGS.common.project_name}(${CONFIGS.common.env}) pin job err`,
            `### ${CONFIGS.common.project_name}(${CONFIGS.common.env}) \n pin job err, please check ${e.message}`);
    });
}
