import {CONFIGS} from "../config";
import axios from "axios";
import * as _ from "lodash";
const http = axios.create();
const DEFAULT_IPFS_CALL_TIMEOUT = 5 * 1000;
http.defaults.timeout = DEFAULT_IPFS_CALL_TIMEOUT;

export class IPFSApi {
    host: string;
    constructor(host: string) {
        this.host = host;
    }

    async fileStat(cid: string): Promise<IPFSFileState> {
        const result = await IPFSApi.ipfsCall(`${this.host}/api/v0/files/stat?arg=/ipfs/${cid}`);
        return { ...result.data };
    }

    static async fileLs(cid: string[], host: string): Promise<any> {
        const result = await IPFSApi.ipfsCall(`${host}/api/v0/ls?${_.map(cid, i => `arg=/ipfs/${i}`).join('&')}`);
        return { ...result.data };
    }

    static async refs(cid: string, host: string): Promise<any> {
        let options: any = {
            url: `${host}/api/v0/refs?arg=/ipfs/${cid}&recursive=true`,
            method: 'POST',
            headers: { Authorization: `Basic ${CONFIGS.ipfs.authSignature}` },
            timeout: DEFAULT_IPFS_CALL_TIMEOUT,
            transformResponse: (res: any) => {
                const split = res.split('\n');
                const list: any[] = [];
                for (const s of split) {
                    if (_.isEmpty(s)) {
                        continue;
                    }
                    list.push(JSON.parse(s))
                }
                return list;
            }
        }
        const result = await http.request(options);
        return { ...result.data };
    }

    private static async ipfsCall(url: string, timeout: number = DEFAULT_IPFS_CALL_TIMEOUT): Promise<any> {
        let options: any = {
            url,
            method: 'POST',
            headers: { Authorization: `Basic ${CONFIGS.ipfs.authSignature}` },
            timeout
        }
        const result = await http.request(options);
        return result;
    }
}

export interface IPFSFileState {
    Hash: string;
    Size: number;
    CumulativeSize: number;
    Blocks: number;
    Type: "file"|"directory";
}
