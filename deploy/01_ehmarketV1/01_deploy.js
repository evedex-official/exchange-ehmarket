const { ethers } = require('ethers');
const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const matchers = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_MATCHERS`] ?? '[]');
  const collateral = process.env[`${hardhat.network.name}_EHMARKET_COLLATERAL`];

  if (matchers.some((matcher) => !ethers.isAddress(matcher))) {
    throw new Error('Invalid matcher wallet address');
  }

  await deployer.deployProxy('contracts/EHMarketV1.sol:EHMarketV1', {
    name: 'EHMarket',
    args: [matchers, collateral],
  });
});
module.exports.tags = ['Upgradable'];
