export const CONFIGS = {
    common: {
        dev: getEnv('ENV', 'dev') === 'dev',
        env: getEnv('ENV', 'dev'),
        project_name: getEnv('PROJECT_NAME', 'bacoo-pinner'),
        cluster: getEnv('CLUSTER', 'true')
    },
    server: {
        port: getEnv('PORT', 3000),
    },
    evolution: {
        schemaTable: 'data_migration',
        location: '../sql',
    },
    mysql: {
        host: getEnv('MYSQL_HOST', 'localhost'),
        port: getEnv('MYSQL_PORT', 23306),
        database: 'bacoo_cloud',
        user: getEnv('MYSQL_USER', 'root'),
        password: getEnv('MYSQL_PASSWORD', 'root'),
    },
    crust: {
        seed: getEnv('CRUST_SEED', ''),
        chainWsUrl: getEnv('WS_ENDPOINT', 'wss://rpc.crust.network'),
        defaultFileSize: getEnv('DEFAULT_FILE_SIZE', 2147483648),
        tips: getEnv('CRUST_TIPS', 0),
        validFileSize: getEnv('VALID_FILE_REPLICAS', 30),
        orderTimeAwait: getEnv('ORDER_TIME_AWAIT', 3000),
        orderFailedTimeAwait: getEnv('ORDER_FAILED_TIME_AWAIT', 60000),
        blockNumberForExpireOrder: getEnv('EXPIRE_ORDER_BLOCK_NUMBER', 10 * 60 * 24 * 30),
        loopTimeAwait: getEnv('LOOP_TIME_AWAIT', 2000),
        checkAmountTimeAwait: getEnv('CHECK_AMOUNT_TIME_AWAIT', 120000),
        checkAmountRetryTimes: getEnv('CHECK_AMOUNT_RETRY_TIMES', 3),
        orderRetryTimes: getEnv('ORDER_RETRY_TIMES', 3),
        minimumAmount: getEnv('MINIMUM_AMOUNT', 1),
        transactionTimeout: getEnv('TRANSACTION_TIMEOUT', 60 * 1000),
    },
    ipfs: {
        delegates: [] as string[],
        authSignature: getEnv('IPFS_AUTH_SIGNATURE', ''),
    },
    dingtalk: {
        notificationUrl: getEnv('WARNING_URL', ''),
        notificationSecret: getEnv('WARNING_SECRET', ''),
    },
}

function getEnv(key: string, defaultValue: string | number): string | number {
    const result = process.env[key] || defaultValue;
    return typeof defaultValue === 'string' ? result : Number(result);
}
