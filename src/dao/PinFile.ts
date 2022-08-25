import sequelize from '../db/mysql';
import {DataTypes, Sequelize} from "sequelize";
import {Deleted} from "../type/common";
import {FileType, PinFileAnalysisStatus, PinFilePinStatus} from "../type/pinner";
export class PinFile {
    static model = sequelize.define(
        'pin_file',
        {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            cid: { type: DataTypes.STRING, allowNull: false },
            pin_status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: PinFilePinStatus.queued },
            file_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: FileType.file },
            analysis_status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: PinFileAnalysisStatus.unfinished },
            order_retry_times: { type: DataTypes.STRING, allowNull: false, defaultValue: 0 },
            file_size: { type: DataTypes.BIGINT, allowNull: false },
            calculated_at: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
            expired_at: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
            replica_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
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
}
