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
        const result = await this.ipfsCall(`${this.host}/api/v0/files/stat?arg=/ipfs/${cid}`);
        return { ...result.data };
    }

    async fileLs(cid: string): Promise<any> {
        const result = await this.ipfsCall(`${this.host}/api/v0/ls?arg=/ipfs/${cid}`);
        return { ...result.data };
    }


    private async ipfsCall(url: string, timeout: number = DEFAULT_IPFS_CALL_TIMEOUT): Promise<any> {
        const result = await http.request({
            url,
            method: 'POST',
            headers: { Authorization: `Basic ${CONFIGS.ipfs.thunderAuthSignature}` },
            timeout: DEFAULT_IPFS_CALL_TIMEOUT
        });
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
