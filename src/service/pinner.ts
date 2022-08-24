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

const dayjs = require("dayjs");
const moment = require('moment');
const _ = require('lodash');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

export async function deleteByRequestId(apiKeyId: number, requestId: string) {
    // TODO: minus storage size
    const existObj = await PinObject.model.findOne({
        attributes: ['id', 'cid', 'deleted'],
        where: {
            api_key_id: apiKeyId,
            request_id: requestId
        }
    });
    if (!_.isEmpty(existObj) && existObj.deleted === Deleted.undeleted) {
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
        });
    }
}

export async function replacePin(
    apiKeyId: number,
    userId: number,
    requestId: string,
    pin: Pin
): Promise<PinStatus> {
    await deleteByRequestId(apiKeyId, requestId);
    return pinByCid(userId, apiKeyId, pin);
}

export async function pinByCid(userId: number, apiKeyId: number, pin: Pin): Promise<PinStatus> {
    // TODO: add storage files
    let pinObjects = await PinObject.model.findOne({
        where: {api_key_id: apiKeyId, cid: pin.cid},
    });
    const existPinFile = await PinFile.model.findOne({
        where: {
            cid: pin.cid
        }
    });
    let fileType = FileType.file;
    let fileSize = 0;
    if (_.isEmpty(existPinFile)) {
        const host = await Gateway.queryGatewayHostByApiKeyId(userId);
        const fileStat = await new IPFSApi(host).fileStat(pin.cid);
        fileType = fileStat.Type === 'file' ? FileType.file : FileType.folder;
        fileSize = fileStat.CumulativeSize;
    }
    const pinObj = {
        name: pin.name ? pin.name : pin.cid,
        request_id: uuid(),
        api_key_id: apiKeyId,
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
        replica_count: 9,
        deleted: Deleted.undeleted,
        update_time: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    const resetPinFile = _.isEmpty(existPinFile) ? false : existPinFile.deleted === Deleted.deleted || existPinFile.pin_status === PinFilePinStatus.failed;
    const pinStatus = (_.isEmpty(existPinFile) || resetPinFile) ? PinFilePinStatus.queued : pinFile.pin_status;
    await sequelize.transaction(async (transaction: Transaction) => {
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
        if (_.isEmpty(pinObjects)) {
            pinObjects = await PinObject.model.create(pinObj, {transaction});
        } else {
            await PinObject.model.update(pinObj, {
                where: {
                    id: pinObjects.id
                },
                transaction
            })
        }
    });
    return PinStatus.parseBaseData({
        ...pinObjects,
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
