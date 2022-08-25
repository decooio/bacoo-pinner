import {serverStart} from "./server";
import {CONFIGS} from "./config";
import {pinJobs} from "./service/pinner";

(async () => {
    await serverStart(CONFIGS.server.port);
    await pinJobs();
})()
