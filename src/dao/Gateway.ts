import sequelize from '../db/mysql';
import {DataTypes, Sequelize} from "sequelize";
import {NodeType} from "../type/gateway";
import {Deleted, Valid} from "../type/common";
import {CommonDAO} from "./Common";
import * as _ from "lodash";
import {gt} from "lodash";

export class Gateway {
    static model = sequelize.define(
        'gateway',
        {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            name: { type: DataTypes.STRING, allowNull: false },
            host: { type: DataTypes.STRING, allowNull: false },
            node_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: NodeType.free },
            valid: { type: DataTypes.TINYINT, allowNull: false, defaultValue: Valid.valid },
            http_password: { type: DataTypes.STRING, allowNull: false },
            create_time: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
            update_time: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        },
        {
            timestamps: true,
            createdAt: 'create_time',
            updatedAt: 'update_time',
        }
    );

    static async queryGatewayHostByApiKeyId(userId: number): Promise<{id: number, host: string } | null> {
        const result = await CommonDAO.queryForObj('SELECT\n' +
            '\tg.`host`, \n' +
            '\tg.`id` \n' +
            'FROM\n' +
            '\tgateway_user gu\n' +
            '\tJOIN gateway g ON g.id = gu.gateway_id\n' +
            'WHERE gu.user_id = ? and g.valid = ? and g.node_type = ? limit 1', [userId, Valid.valid, NodeType.premium]);
        if (!_.isEmpty(result)) {
            return result;
        }
        const gateway = await this.model.findOne({
            attributes: ['id', 'host'],
            where: {
                node_type: NodeType.free,
                valid: Valid.valid
            },
            order: [['id', 'desc']],
            limit: 1,
        });
        return {
            id: gateway.id,
            host: gateway.host
        };
    }

    static async queryGatewayHostByCid(cid: string): Promise<string | null> {
        const result = await CommonDAO.queryForObj('SELECT\n' +
            '\tg.`host` \n' +
            'FROM\n' +
            '\tpin_object o\n' +
            '\tJOIN user_api_key a ON a.id = o.api_key_id\n' +
            '\tJOIN gateway_user gu ON gu.user_id = a.user_id\n' +
            '\tJOIN gateway g ON g.id = gu.gateway_id \n' +
            'WHERE\n' +
            '\to.deleted = ? \n' +
            '\tAND a.valid = ? \n' +
            '\tAND g.valid = ? \n' +
            '\tAND o.cid = ? \n' +
            'ORDER BY\n' +
            '\tg.node_type DESC \n' +
            '\tLIMIT 1', [Deleted.undeleted, Valid.valid, Valid.valid, cid]);
        if (!_.isEmpty(result)) {
            return result.host;
        }
        const gateway = await this.model.findOne({
            where: {
                node_type: NodeType.free
            },
            limit: 1,
        });
        return gateway.host;
    }
}
