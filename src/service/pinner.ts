import {FileType, Pin, PinFileAnalysisStatus, PinFilePinStatus, PinStatus} from "../type/pinner";
import {Deleted} from "../type/common";
import {PinObject} from "../dao/PinObject";
import {uuid} from "../util/common";
import {CONFIGS} from "../config";
import {Transaction} from "sequelize";
import sequelize from "../db/mysql";
import {Gateway} from "../dao/Gateway";
import {IPFSApi} from "./ipfs";
import {PinFile} from "../dao/PinFile";
import {BillingPlan} from "../dao/BillingPlan";
import BigNumber from "bignumber.js";
import {logger} from "../util/logger";

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

    if (!_.isEmpty(existPinObject) && !_.isEmpty(existPinFile) && existPinObject.deleted === Deleted.undeleted) {
        const data = {
            ...existPinObject.dataValues,
            status: existPinFile.pin_status
        };
        const result = PinStatus.parseBaseData(data);
        logger.debug(`${JSON.stringify(result)}`);
        logger.debug(`${JSON.stringify(data)}`);
        return result;
    }

    let fileType = !_.isEmpty(existPinFile) ? existPinFile.file_type : FileType.file;
    let fileSize = !_.isEmpty(existPinFile) ? existPinFile.file_size : 0;
    if (_.isEmpty(existPinFile)) {
        const host = await Gateway.queryGatewayHostByApiKeyId(userId);
        const fileStat = await new IPFSApi(host).fileStat(pin.cid);
        fileType = fileStat.Type === 'file' ? FileType.file : FileType.folder;
        fileSize = fileStat.Size;
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
        analysis_status: PinFileAnalysisStatus.unfinished,
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
        } else if (resetPinFile){
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
    });
    return PinStatus.parseBaseData({
        ...existPinObject,
        ...pinObj,
        status: pinStatus
    });
}

// TODO: Analysis files
export async function analysisPinFolderFiles() {

}

// TODO: Order files
export async function orderFiles() {

}

// TODO: Update pin file status
export async function updatePinFileStatus() {

}

// TODO: ReOrder Expiring files
export async function reOrderExpiringFiles() {

}
