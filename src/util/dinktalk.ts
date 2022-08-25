import {CONFIGS} from "../config";
import {logger} from "./logger";

const axios = require('axios');
const crypto = require('crypto');

export async function sendDinkTalkMsg(
    title: string,
    text: string
) {
    try {
        const time = Date.now();
        const secret = CONFIGS.dingtalk.notificationSecret;
        const notificationUrl = CONFIGS.dingtalk.notificationUrl;
        const hmacCode = crypto
            .createHmac('sha256', secret as string)
            .update(`${time}\n${secret}`)
            .digest('base64');
        const sign = encodeURIComponent(hmacCode);
        const url = `${notificationUrl}&timestamp=${time}&sign=${sign}`;

        await axios.request({
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            url,
            data: {
                msgtype: 'markdown',
                markdown: {
                    title,
                    text: `${text}(${CONFIGS.common.env})`,
                },
            },
        });
    } catch (error) {
        logger.error(
            `Error sending Dingtalk notification. ${error.message}`,
            error.stack
        );
    }
}
