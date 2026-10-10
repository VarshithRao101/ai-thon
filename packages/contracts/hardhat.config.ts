import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

/**
 * Local tests run on Hardhat's in-process network (no keys). Amoy deploys read
 * the RPC URL and the TESTNET-ONLY key from env via configVariable, so neither
 * is ever written into this file.
 */
export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Widest chain support (Amoy, Sepolia, local nodes).
      evmVersion: "paris",
    },
  },
  networks: {
    amoy: {
      type: "http",
      chainType: "l1",
      chainId: 80_002,
      url: configVariable("CHAIN_RPC_URL"),
      accounts: [configVariable("ANCHORER_PRIVATE_KEY")],
    },
  },
});
