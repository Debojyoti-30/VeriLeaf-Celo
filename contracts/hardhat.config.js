require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

const PRIVATE_KEY = process.env.CELO_PRIVATE_KEY || '';
const CELO_RPC_URL = process.env.CELO_RPC_URL || 'https://forno.celo.org';
// Celo Sepolia Testnet RPC (per user): https://forno.celo-sepolia.celo-testnet.org
const CELO_SEPOLIA_RPC_URL = process.env.CELO_SEPOLIA_RPC_URL || 'https://forno.celo-sepolia.celo-testnet.org';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    // Celo Sepolia Testnet (per user specification)
    celoSepolia: {
      url: CELO_SEPOLIA_RPC_URL,
      chainId: 11142220,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Celo Mainnet (optional, keep for later)
    celo: {
      url: CELO_RPC_URL,
      chainId: 42220,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Optional: set CELOSCAN_API_KEY in .env to enable verification
    apiKey: {
      celoSepolia: process.env.CELOSCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'celoSepolia',
        chainId: 11142220,
        urls: {
          apiURL: 'https://api-sepolia.celoscan.io/api',
          browserURL: 'https://sepolia.celoscan.io',
        },
      },
    ],
  },
};
