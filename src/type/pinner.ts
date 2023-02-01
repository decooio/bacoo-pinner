import * as _ from "lodash";
import {Request} from "express";
import * as moment from 'moment';

export enum TextMatchingStrategy {
    exact = 'exact',
    iexact = 'iexact',
    partial =  'partial',
    ipartial = 'ipartial',
};

export type PinCommonStatus = 'queued' | 'pinning' | 'pinned' | 'failed';

export enum PinFilePinStatus {
    queued ,
    pinning,
    pinned,
    failed
}

export enum FileType {
    file,
    folder
}

export enum IPFSFileType {
    file = 2,
    folder = 1
}

export class PinObjectsQuery {
    apikeyId: number;
    cid: string[];
    name: string;
    match: string;
    status: number[];
    before: string;
    after: string;
    limit: number;
    meta: Map<string, string>;

    static parseQuery(req: any): PinObjectsQuery {
        const query = new PinObjectsQuery();
        query.apikeyId = _.parseInt(req.apikeyId as string);
        query.cid = req.query.cid ? (req.query.cid as string).split(',') : null;
        query.name = req.query.name as string;
        query.match = req.query.match as string;
        query.status = req.query.status
            ? _.map((req.query.status as string).split(','), (i: string) => (PinFilePinStatus[i as PinCommonStatus]))
            : null;
        query.before = req.query.before
            ? moment(req.query.before as string).format('YYYY-MM-DD HH:mm:ss')
            : null;
        query.after = req.query.after
            ? moment(req.query.after as string).format('YYYY-MM-DD HH:mm:ss')
            : null;
        query.limit = _.parseInt(req.query.limit as string);
        const meta = new Map<string, string>();
        req.query = _.omit(req.query, baseQuery);
        _.forEach(req.query, (v: string, k: string) => {
            meta.set(k, v);
        });
        query.meta = meta;
        return query;
    }
}

export enum PinFileAnalysisStatus {
    unfinished,
    finished
}

export class PinResults {
    count: number;
    results: PinStatus[];
}

export class PinStatus {
    requestId: string;
    status: string;
    created: string;
    pin: Pin;
    delegates: Set<string>;
    info: Map<string, string>;

    static parseBaseData(baseData: any): PinStatus {
        const result = new PinStatus();
        result.requestId = baseData.request_id;
        result.status = PinFilePinStatus[baseData.status];
        result.created = dateFormat(baseData.create_time);
        result.pin = Pin.parseBaseData(baseData);
        result.delegates = baseData.delegates ? baseData.delegates.split(',') : [];
        result.info = baseData.info ? baseData.info : {};
        return result;
    }
}

export class Pin {
    cid: string;
    name: string;
    origins: Set<string>;
    meta: Map<string, string>;

    static parseBaseData(baseData: any): Pin {
        const pin = new Pin();
        pin.cid = baseData.cid;
        pin.name = baseData.name;
        pin.meta = baseData.meta;
        pin.origins =
            baseData.origins && baseData.origins.length > 0
                ? baseData.origins.split(',')
                : [];
        return pin;
    }

    static parsePinFromRequest(req: any): Pin {
        const pin = new Pin();
        pin.cid = req.body.cid;
        pin.name = req.body.name ? req.body.name : req.body.cid;
        pin.origins = _.isEmpty(req.body.origins) ? [] : req.body.origins;
        pin.meta = req.body.meta;
        return pin;
    }
}

function dateFormat(time: any): string {
    return moment(time).format('yyyy-MM-DDTHH:mm:ssZ');
}

export enum PinObjectStatus {
    queued = 'queued',
    pinning = 'pinning',
    pinned = 'pinned',
    failed = 'failed',
};

export class Failure {
    error: FailureError;
    message: string;

    constructor(error: FailureError) {
        this.error = error;
        this.message = error.details;
    }

    static commonErr(err: string): Failure {
        return new Failure(FailureError.commonErr(err));
    }
}

export class FailureError {
    reason: string;
    details: string;

    constructor(reason: string, details: string) {
        this.reason = reason;
        this.details = details;
    }

    static commonErr(err: string): FailureError {
        return new FailureError(err, err);
    }
}


const baseQuery = [
    'userId',
    'cid',
    'name',
    'match',
    'status',
    'before',
    'after',
    'limit',
];
