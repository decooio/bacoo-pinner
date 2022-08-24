import {ApiPromise, WsProvider} from "@polkadot/api";
import {typesBundleForPolkadot} from "@crustio/type-definitions";
import {CONFIGS} from "../../config";

export const api = new ApiPromise({
    provider: new WsProvider(CONFIGS.crust.chainWsUrl as string),
    typesBundle: typesBundleForPolkadot,
});
