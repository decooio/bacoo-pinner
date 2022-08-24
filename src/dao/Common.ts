import sequelize from "../db/mysql";
import * as _ from "lodash";
import {Transaction} from "sequelize";

export class CommonDAO {
    static queryForCount(sql: string, replace: any[]): Promise<number> {
        return sequelize
            .query(sql, {
                replacements: replace,
                type: sequelize.QueryTypes.SELECT,
                raw: true,
            })
            .then((r: any[]) => {
                if (!_.isEmpty(r)) {
                    const res = r[0];
                    return res[Object.keys(res)[0]];
                }
            });
    }

    static queryForArray(sql: string, replace: any[]): Promise<any[]> {
        return sequelize
            .query(sql, {
                replacements: replace,
                type: sequelize.QueryTypes.SELECT,
            })
            .then((r: any[]) => {
                if (!_.isEmpty(r)) {
                    return r;
                }
                return [];
            });
    }


    static queryForObj(sql: string, replace: any[]): Promise<any> {
        return sequelize
            .query(sql, {
                replacements: replace,
                type: sequelize.QueryTypes.SELECT,
            })
            .then((r: any[]) => {
                if (!_.isEmpty(r)) {
                    return r[0];
                }
                return {};
            });
    }

    static queryForUpdate(sql: string, replace: any[], transaction?: Transaction): Promise<number> {
        return sequelize
            .query(sql, {
                replacements: replace,
                type: sequelize.QueryTypes.UPDATE,
                transaction
            })
            .then((r: any) => {
                return 0;
            });
    }
}
