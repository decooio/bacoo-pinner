import { v4 as uuidv4 } from 'uuid';
import * as moment from 'moment';
import BigNumber from "bignumber.js";
const crypto = require("crypto");

import * as Bluebird from 'bluebird';

export async function timeout<T>(
    p: Promise<T>,
    timeout: number,
    timeoutValue: T | (() => T)
): Promise<T> {
    const emptyResult = {} as any; // eslint-disable-line
    const v = await Bluebird.race([p, Bluebird.delay(timeout, emptyResult)]);
    if (v === emptyResult) {
        if (typeof timeoutValue === 'function') {
            return (timeoutValue as () => T)();
        }
        return timeoutValue;
    }
    return v;
}

export async function timeoutOrError<T>(
    name: string,
    p: Promise<T>,
    time: number
): Promise<T> {
    return timeout(p, time, () => {
        throw new Error(`"${name}" failed to resolve in ${time}ms`);
    });
}


export const fromDecimal = (amount: number | string) => {
    const amountBN = new BigNumber(amount);
    return amountBN.multipliedBy(new BigNumber(1_000_000_000_000));
};

export const isDate = (value: string): boolean => {
    return moment(value).isValid();
};

export function sleep(time: number) {
    return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, time);
    });
}

export function uuid(): string {
    return `${uuidv4()}-${new Date().getTime()}`;
}

export function md5(str: string): string {
    const md5Crypto = crypto.createHash('md5');
    return md5Crypto.update(str).digest('hex');
}

