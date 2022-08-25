import * as express from 'express';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
require('express-async-errors');
import {logger} from "../util/logger";
import {CommonResponse} from "../type/common";
import {Failure} from "../type/pinner";
import {router as psa} from "../router/psa";
import {auth} from "../middlewares/auth";

export const serverStart = async (port: string | number) => {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));
    app.use('/ping', (req, res) => {
        CommonResponse.success().send(res);
    });
    app.use('/psa', auth, psa);
    app.use((err: any, req: any, res: any, next: any) => {
        logger.error(`Server err: ${err.stack}`)
        res.status(500).json(Failure.commonErr('server err'));
    });
    logger.info(`Server start on: ${port}`);
    app.listen(port);
}


