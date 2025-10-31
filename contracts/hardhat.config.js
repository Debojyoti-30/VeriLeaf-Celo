require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

const PRIVATE_KEY = process.env.CELO_PRIVATE_KEY || '';
const ALFAJORES_RPC_URL = process.env.ALFAJORES_RPC_URL || 'https://alfajores-forno.celo-testnet.org';
const CELO_RPC_URL = process.env.CELO_RPC_URL || 'https://forno.celo.org';

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
    alfajores: {
      url: ALFAJORES_RPC_URL,
      chainId: 44787,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    celo: {
      url: CELO_RPC_URL,
      chainId: 42220,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
