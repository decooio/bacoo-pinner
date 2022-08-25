/**
 * @auther zibo
 * @date 2021/9/6
 */
import * as express from 'express';
import {query, body, param} from 'express-validator';
import {PinObject} from "../dao/PinObject";
import {
    Failure,
    Pin,
    PinObjectsQuery,
    PinObjectStatus,
    PinResults,
    PinStatus,
    TextMatchingStrategy
} from "../type/pinner";
import {deleteByRequestId, pinByCid, replacePin} from "../service/pinner";
import {validate} from "../middlewares/validate";
import {isDate} from "../util/common";
const _ = require('lodash');
export const router = express.Router();
router.get(
    '/pins',
    validate([
        query('cid')
            .optional()
            .custom((value: any) => {
                if (_.isArray(value)) {
                    return value.length > 0 && value.length < 10;
                } else {
                    return _.isString(value);
                }
            }),
        query('name').optional().isString().isLength({max: 255}),
        query('match').optional().isIn(_.keys(TextMatchingStrategy)),
        query('status')
            .optional()
            .custom((value: any) => {
                if (_.isString(value)) {
                    const pinStatus = _.keys(PinObjectStatus);
                    const values = (value as string).split(',');
                    for (const item of values) {
                        if (!_.includes(pinStatus, item)) {
                            return false;
                        }
                    }
                    return true;
                } else {
                    return false;
                }
            }),
        query('before').custom(isDate),
        query('after').custom(isDate),
        query('limit').default(10).isInt({max: 1000, min: 1}),
    ]),
    async (req, res) => {
        const r: PinResults = await PinObject.selectPinObjectListByQuery(PinObjectsQuery.parseQuery(req));
        return res.json(r);
    }
);

router.get('/pins/:requestId', async (req: any, res) => {
    const r = await PinObject.selectPinObjectByRequestIdAndUserId(req.params.requestId, req.apikeyId)
    if (_.isEmpty(r)) {
        res.status(400).json(Failure.commonErr('not found'));
    } else {
        res.json(r);
    }
});

router.post(
    '/pins/:requestId',
    validate([
        body('cid').isString().notEmpty().withMessage('cid not empty'),
        body('name').optional().isString(),
        body('origins').optional().isArray(),
    ]),
    async (req: any, res) => {
        const r = await replacePin(req.apikeyId, req.userId, req.params.requestId, Pin.parsePinFromRequest(req));
        return res.json(r);
    }
);

router.post(
    '/pins',
    validate([
        body('cid').isString().notEmpty().withMessage('cid not empty'),
        body('name').optional().isString(),
        body('origins').optional().isArray(),
    ]),
    async (req: any, res) => {
        const r = await pinByCid(req.userId, req.apikeyId, Pin.parsePinFromRequest(req));
        res.json(r);
    }
);

router.delete('/pins/:requestId', async (req: any, res) => {
    await deleteByRequestId(req.userId, req.apikeyId, req.params.requestId);
    res.sendStatus(200);
});
