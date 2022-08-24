import sequelize from '../db/mysql';
import {DataTypes, QueryTypes, Sequelize} from "sequelize";
import {Deleted} from "../type/common";
import {PinObjectsQuery, PinResults, PinStatus, TextMatchingStrategy} from "../type/pinner";
import * as _ from "lodash";
import {CommonDAO} from "./Common";
export class PinObject {
    static model = sequelize.define(
        'pin_object',
        {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            name: { type: DataTypes.STRING, allowNull: false },
            request_id: { type: DataTypes.STRING, allowNull: false },
            api_key_id: { type: DataTypes.INTEGER, allowNull: false },
            cid: { type: DataTypes.STRING, allowNull: false },
            info: { type: DataTypes.JSON, allowNull: true },
            meta: { type: DataTypes.JSON, allowNull: true },
            delegates: { type: DataTypes.TEXT, allowNull: true },
            origins: { type: DataTypes.TEXT, allowNull: true },
            deleted: { type: DataTypes.TINYINT, allowNull: false, defaultValue: Deleted.undeleted },
            create_time: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
            update_time: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        },
        {
            timestamps: true,
            createdAt: 'create_time',
            updatedAt: 'update_time',
        }
    );

    static selectPinObjectCountByQuery(query: PinObjectsQuery): Promise<number> {
        const [sql, args] = this.parsePinObjectQuery(
            query,
            `select count(*) from pin_object join pin_file on pin_object.cid = pin_file.cid where pin_object.deleted = ${Deleted.undeleted} and pin_object.api_key_id = ?`,
            [query.apikeyId]
        );
        return CommonDAO.queryForCount(sql, args);
    }

    static async selectPinObjectListByQuery(query: PinObjectsQuery): Promise<PinResults> {
        const count = await this.selectPinObjectCountByQuery(query);
        const pinResult = new PinResults();
        pinResult.count = count;
        if (count > 0) {
            const [sql, args] = this.parsePinObjectQuery(
                query,
                `select pin_object.*, pin_file.pin_status as 'status' from pin_object join pin_file on pin_object.cid = pin_file.cid where pin_object.deleted = ${Deleted.undeleted} and pin_object.api_key_id = ?`,
                [query.apikeyId]
            );
            const result = await CommonDAO.queryForArray(sql, args);
            pinResult.results = _.map(result, (i: any) => PinStatus.parseBaseData(i));
        } else {
            pinResult.results = [];
        }
        return pinResult;
    }

    static async selectPinObjectByRequestIdAndUserId(requestId: string, apiKeyId: number) : Promise<PinStatus>{
        const result = await CommonDAO.queryForObj(
            `select pin_object.*, pin_file.pin_status as 'status' from pin_object join pin_file on pin_object.cid = pin_file.cid where pin_object.deleted = 0 and pin_object.api_key_id = ? and pin_object.request_id = ?`,
            [apiKeyId, requestId]
        );
        if (!_.isEmpty(result)) {
            return PinStatus.parseBaseData(result);
        } else {
            return null;
        }
    }

    private static parsePinObjectQuery(
        query: PinObjectsQuery,
        baseSql: string,
        baseArgs: any[]
    ): [string, any[]] {
        let sql = baseSql;
        let args = baseArgs;
        if (query.cid) {
            if (_.isArray(query.cid)) {
                sql = `${sql} and pin_object.cid in (${_.map(query.cid, () => '?').join(',')})`;
            } else {
                sql = `${sql} and pin_object.cid = ?`;
            }
            args = _.concat(args, query.cid);
        }
        if (query.after) {
            sql = `${sql} and pin_object.create_time >= ?`;
            args.push(query.after);
        }
        if (query.before) {
            sql = `${sql} and pin_object.create_time <= ?`;
            args.push(query.before);
        }
        if (query.status) {
            if (_.isArray(query.status)) {
                sql = `${sql} and pin_file.pin_status in (${_.map(query.status, () => '?').join(
                    ','
                )})`;
            } else {
                sql = `${sql} and pin_file.pin_status = ?`;
            }
            args = _.concat(args, query.status);
        }
        if (query.name) {
            sql = `${sql} and pin_object.\`name\` = ?`;
            args.push(query.name);
        }
        if (query.meta && query.meta.size > 0) {
            const metaSql: string[] = [];
            query.meta.forEach((value: string, key: string) => {
                let queryValue = value;
                if (query.match === TextMatchingStrategy.iexact) {
                    queryValue = `"${value}"`;
                    metaSql.push('UPPER(pin_object.meta->?)=UPPER(?)');
                } else if (query.match === TextMatchingStrategy.partial) {
                    queryValue = `%${value}%`;
                    metaSql.push('pin_object.meta->? like ?');
                } else if (query.match === TextMatchingStrategy.ipartial) {
                    queryValue = `%${value}%`;
                    metaSql.push('UPPER(pin_object.meta->?) like UPPER(?)');
                } else {
                    metaSql.push('pin_object.meta->?=?');
                }
                args.push(`$.${key}`, queryValue);
            });
            sql = `${sql} and (${metaSql.join(' and ')})`;
        }
        if (query.limit) {
            sql = `${sql} limit ?`;
            args.push(query.limit);
        }
        return [sql, args];
    }

}
