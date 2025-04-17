require('@nomicfoundation/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('./scripts/deploy');
require('dotenv').config();
const path = require('path');

function accounts(...names) {
  return names.reduce((accounts, name) => (process.env[name] ? [...accounts, process.env[name]] : accounts), []);
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  sourcify: {
    enabled: true,
    // Optional: specify a different Sourcify server
    apiUrl: "https://sourcify.dev/server",
    // Optional: specify a different Sourcify repository
    browserUrl: "https://repo.sourcify.dev",
  },
  paths: {
    deploy: path.resolve(__dirname, './deploy'),
    deployments: path.resolve(__dirname, './deployments'),
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      blockGasLimit: 10000000,
    },
    arbitrum_one: {
      url: process.env.ARBITRUM_ONE_NODE,
      chainId: 42161,
      blockGasLimit: 30_000_000,
      accounts: accounts('DEPLOYER'),
    },
    arbitrum_sepolia: {
      url: process.env.ARBITRUM_SEPOLIA_NODE,
      chainId: 421614,
      blockGasLimit: 6_000_000,
      accounts: accounts('DEPLOYER'),
    },
    eventum: {
      url: process.env.EVENTUM_NODE,
      chainId: 161803,
      gasPrice: 1_000_000_000,
      blockGasLimit: 60_000_000,
      accounts: accounts('DEPLOYER'),
    },
    eventum_testnet: {
      url: process.env.EVENTUM_TESTNET_NODE,
      chainId: 16182,
      gasPrice: 1_000_000_000,
      blockGasLimit: 60_000_000,
      accounts: accounts('DEPLOYER'),
    },
    eventum_demo: {
      url: process.env.EVENTUM_TESTNET_NODE,
      chainId: 16182,
      gasPrice: 1_000_000_000,
      blockGasLimit: 60_000_000,
      accounts: accounts('DEPLOYER'),
    },
  },
  etherscan: {
    apiKey: {
      arbitrumOne: process.env.ARBITRUM_ONE_ETHERSCAN
    }
  },
  namedAccounts: {
    deployer: {
      '': 0,
    },
  },
};
