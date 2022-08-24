import sequelize from '../db/mysql';
import {DataTypes, Sequelize} from "sequelize";
import {NodeType} from "../type/gateway";
import {Valid} from "../type/common";
import {CommonDAO} from "./Common";
import * as _ from "lodash";
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

    static async queryGatewayHostByApiKeyId(userId: number): Promise<string | null> {
        const result = await CommonDAO.queryForObj('SELECT\n' +
            '\tg.`host` \n' +
            'FROM\n' +
            '\tgateway_user gu ON a.user_id = gu.user_id\n' +
            '\tJOIN gateway g ON g.id = gu.gateway_id\n' +
            'WHERE gu.user_id = ? and g.valid = ? and g.node_type = ? limit 1', [userId, Valid.valid, NodeType.premium]);
        if (!_.isEmpty(result)) {
            return result.host;
        }
        const gateway = await this.model.findOne({
            where: {
                node_type: NodeType.free
            },
            order: [['id', 'desc']],
            limit: 1,
        });
        return gateway.host;
    }
}
