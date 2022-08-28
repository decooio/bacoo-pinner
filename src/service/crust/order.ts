import { KeyringPair } from '@polkadot/keyring/types';
import { ApiPromise } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import BigNumber from 'bignumber.js';
import createKeyring from './krp';
import {logger} from "../../util/logger";
import {CONFIGS} from "../../config";
import {sleep} from "../../util/common";
import {sendDinkTalkMsg} from "../../util/dinktalk";
import {api} from "./api";

const DECIMAL = 1_000_000_000_000;

export async function checkingAccountBalance(seed: string): Promise<boolean> {
  try {
    await api.isReadyOrError;
    const krp = createKeyring(seed as string);
    let orderBalance = (await getAccountBalance(krp.address)).dividedBy(DECIMAL);
    const minimumAmount = CONFIGS.crust.minimumAmount;
    if (orderBalance.comparedTo(minimumAmount) >= 0) {
      return true;
    }
    logger.error(
      `orderBalance: ${orderBalance.toFixed(5)} min: ${minimumAmount}`
    );
    await sendDinkTalkMsg(`${CONFIGS.common.project_name}(${CONFIGS.common.env}) balance warning`,
        `### ${CONFIGS.common.project_name}(${CONFIGS.common.env}) \n address: ${krp.address } \n current balance: ${orderBalance}cru, min balance: ${minimumAmount}cru`);
  } catch (e) {
    logger.warn(`check account balance failed: ${e.message}`);
    await sendDinkTalkMsg(`${CONFIGS.common.project_name}(${CONFIGS.common.env}) balance warning`,
        `### ${CONFIGS.common.project_name}(${CONFIGS.common.env}) \n check account balance failed: ${e.message}`);
  }
  return false;
}

export async function getAccountBalance(
  account: string
): Promise<BigNumber> {
  await api.isReadyOrError;
  const infoStr = await api.query.system.account(account);
  const info = JSON.parse(JSON.stringify(infoStr));
  return new BigNumber(info.data.free);
}

export async function placeOrder(
  krp: KeyringPair,
  fileCID: string,
  fileSize: number,
  tip: string,
  memo: string
) {
  // Determine whether to connect to the chain
  await api.isReadyOrError;
  // Generate transaction
  // fileCid, fileSize, tip, 0
  const pso = api.tx.market.placeStorageOrder(fileCID, fileSize, tip, memo);
  return sendTx(krp, pso)
}

export async function sendTx(krp: KeyringPair, tx: SubmittableExtrinsic) {
  return new Promise((resolve, reject) => {
    tx.signAndSend(krp, ({ events = [], status }) => {
      logger.info(
        `  ↪ 💸 [tx]: Transaction status: ${status.type}, nonce: ${tx.nonce}`
      );

      if (
        status.isInvalid ||
        status.isDropped ||
        status.isUsurped ||
        status.isRetracted
      ) {
        reject(new Error('order invalid'));
      }

      if (status.isInBlock) {
        events.forEach(({ event: { method, section } }) => {
          if (section === 'system' && method === 'ExtrinsicFailed') {
            // Error with no detail, just return error
            logger.info(`  ↪ 💸 ❌ [tx]: Send transaction(${tx.type}) failed.`);

            resolve(false);
          } else if (method === 'ExtrinsicSuccess') {
            logger.info(
              `  ↪ 💸 ✅ [tx]: Send transaction(${tx.type}) success.`
            );
          }
        });
        logger.info('Included at block hash', status.asInBlock.toHex());
        resolve(status.asInBlock.toHex());
      } else if (status.isFinalized) {
        logger.info('Finalized block hash', status.asFinalized.toHex());
      }
    }).catch((e: any) => {
      reject(e);
    });
  });
}

interface IFileInfo {
  file_size: number;
  expired_at: number;
  calculated_at: number;
  amount: number;
  prepaid: number;
  reported_replica_count: number;
  replicas: any;
}

export async function getOrderState(cid: string) {
  await api.isReadyOrError;
  const res = await api.query.market.filesV2(cid);
  const data = res ? JSON.parse(JSON.stringify(res)) : null;
  if (data) {
    try {
      const { replicas, ...meaningfulData } = data as IFileInfo;
      return {
        meaningfulData,
        replicas,
      };
    } catch (e) {
      return null;
    }
  }
  return null;
}

