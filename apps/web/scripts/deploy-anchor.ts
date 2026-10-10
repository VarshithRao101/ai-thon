/**
 * Deploy FlowLedgerAnchor (docs/08) with the TESTNET-ONLY anchorer key from
 * apps/web/.env.local. The wallet is both admin and anchorer.
 *
 *   Local:  pnpm --filter @flowledger/contracts chain        (another terminal)
 *           CHAIN_ID=31337 CHAIN_RPC_URL=http://127.0.0.1:8545 pnpm --filter @flowledger/web anchor:deploy
 *   Amoy:   pnpm --filter @flowledger/web anchor:deploy --save   (uses CHAIN_* from .env.local)
 *
 * --save writes ANCHOR_CONTRACT_ADDRESS into .env.local (an address, not a secret).
 * Never prints the private key.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { anchorAbi, anchorBytecode } from "@flowledger/ledger";
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  type Hex,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

config({ path: [".env.local", ".env"], quiet: true });

const LOCAL = 31_337;
const LINE_BREAK = /\r?\n/;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a linear deploy script (checks, fund, deploy, save)
async function main() {
  const chainId = Number(process.env.CHAIN_ID);
  const rpcUrl = process.env.CHAIN_RPC_URL;
  const key = process.env.ANCHORER_PRIVATE_KEY as Hex | undefined;
  if (!(chainId && rpcUrl && key)) {
    throw new Error(
      "Set CHAIN_ID, CHAIN_RPC_URL and ANCHORER_PRIVATE_KEY (pnpm wallet:new) first"
    );
  }
  const chain = defineChain({
    id: chainId,
    name: chainId === LOCAL ? "Local Hardhat" : `Chain ${chainId}`,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const account = privateKeyToAccount(key);
  const transport = http(rpcUrl, { timeout: 30_000 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  if (chainId === LOCAL) {
    // Local dev chain only: give the anchorer test ETH.
    await publicClient.request({
      method: "hardhat_setBalance" as never,
      params: [account.address, `0x${parseEther("100").toString(16)}`] as never,
    });
  }
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(
    `[deploy] chain ${chainId}, anchorer ${account.address}, balance ${formatEther(balance)}`
  );
  if (balance === BigInt(0)) {
    throw new Error(
      "The anchorer wallet has no test POL yet: fund it from a faucet (docs/19)"
    );
  }

  const hash = await walletClient.deployContract({
    abi: anchorAbi,
    bytecode: anchorBytecode,
    args: [account.address, account.address],
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: chainId === LOCAL ? 1 : 2,
    timeout: 180_000,
  });
  if (!receipt.contractAddress) {
    throw new Error(`Deployment failed in tx ${hash}`);
  }
  console.log(
    `[deploy] FlowLedgerAnchor at ${receipt.contractAddress} (tx ${hash}, gas ${receipt.gasUsed})`
  );

  if (process.argv.includes("--save")) {
    const target = resolve(process.cwd(), ".env.local");
    const lines = existsSync(target)
      ? readFileSync(target, "utf8").split(LINE_BREAK)
      : [];
    const entry = `ANCHOR_CONTRACT_ADDRESS=${receipt.contractAddress}`;
    const index = lines.findIndex((l) =>
      l.startsWith("ANCHOR_CONTRACT_ADDRESS=")
    );
    if (index >= 0) {
      lines[index] = entry;
    } else {
      lines.splice(
        lines.at(-1) === "" ? lines.length - 1 : lines.length,
        0,
        entry
      );
    }
    writeFileSync(target, lines.join("\n"), "utf8");
    console.log(
      "[deploy] saved ANCHOR_CONTRACT_ADDRESS to apps/web/.env.local"
    );
  }
}

main().catch((error) => {
  console.error(
    "[deploy] failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
