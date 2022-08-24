import { v4 as uuidv4 } from 'uuid';
import * as moment from 'moment';
import BigNumber from "bignumber.js";
const crypto = require("crypto");

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

