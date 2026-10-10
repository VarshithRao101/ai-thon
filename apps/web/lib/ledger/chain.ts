import "server-only";

import { anchorAbi } from "@flowledger/ledger";
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type ChainConfig = {
  chainId: number;
  rpcUrl: string;
  contract: Hex;
  privateKey: Hex;
  explorer?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KEY = /^0x[0-9a-fA-F]{64}$/;

/** Chain settings from env, or the names of what is missing. */
export function chainConfig():
  | { ok: true; config: ChainConfig }
  | { ok: false; missing: string[] } {
  const chainId = Number(process.env.CHAIN_ID);
  const rpcUrl = process.env.CHAIN_RPC_URL?.trim();
  const contract = process.env.ANCHOR_CONTRACT_ADDRESS?.trim();
  const privateKey = process.env.ANCHORER_PRIVATE_KEY?.trim();
  const missing: string[] = [];
  if (!Number.isInteger(chainId) || chainId <= 0) {
    missing.push("CHAIN_ID");
  }
  if (!rpcUrl) {
    missing.push("CHAIN_RPC_URL");
  }
  if (!(contract && ADDRESS.test(contract))) {
    missing.push("ANCHOR_CONTRACT_ADDRESS");
  }
  if (!(privateKey && KEY.test(privateKey))) {
    missing.push("ANCHORER_PRIVATE_KEY");
  }
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return {
    ok: true,
    config: {
      chainId,
      rpcUrl: rpcUrl as string,
      contract: contract as Hex,
      privateKey: privateKey as Hex,
      explorer: process.env.EXPLORER_BASE_URL?.trim() || undefined,
    },
  };
}

const CHAIN_NAMES: Record<number, string> = {
  31337: "Local Hardhat",
  80002: "Polygon Amoy",
};

export function chainOf(
  config: Pick<ChainConfig, "chainId" | "rpcUrl">
): Chain {
  return defineChain({
    id: config.chainId,
    name: CHAIN_NAMES[config.chainId] ?? `Chain ${config.chainId}`,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    testnet: true,
  });
}

export function clients(config: ChainConfig) {
  const chain = chainOf(config);
  const transport = http(config.rpcUrl, { timeout: 20_000, retryCount: 2 });
  const account = privateKeyToAccount(config.privateKey);
  return {
    account,
    publicClient: createPublicClient({ chain, transport }) as PublicClient,
    walletClient: createWalletClient({ account, chain, transport }),
    abi: anchorAbi,
  };
}
