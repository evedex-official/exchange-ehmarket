const { ethers } = require('ethers');
const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const matchers = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_MATCHERS`] ?? '[]');
  const collateral = process.env[`${hardhat.network.name}_EHMARKET_COLLATERAL`];
  if (matchers.some((matcher) => !ethers.isAddress(matcher))) {
    throw new Error('Invalid matcher wallet address');
  }
  if (ethers.isAddress(collateral)) {
    throw new Error('Invalid collateral wallet address');
  }

  await deployer.deploy('contracts/EHMarket.sol:EHMarket', {
    name: 'EHMarket',
    args: [matchers, collateral],
  });
});
module.exports.tags = ['NonUpgradable'];
