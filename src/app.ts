import {serverStart} from "./server";
import {CONFIGS} from "./config";

(async () => {
    await serverStart(CONFIGS.server.port);
})()
