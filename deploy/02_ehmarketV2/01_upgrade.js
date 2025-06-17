const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  // limits example: '[{"limit":"1_000_000_000","userLimit":"1_000_000","timeWindow":1}]'
  const initialWithdrawLimits = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_WITHDRAW_LIMITS`] || '[]');

  try {
    const proxyAddress = (await deployer.artifacts.readDeploy('EHMarket')).address;
    const currentContract = await hre.ethers.getContractAt('EHMarketV2', proxyAddress);
    const isMigratedToV2 = await currentContract.migratedToV2();
    if (isMigratedToV2) {
      console.info('EHMarket is already upgraded to V2. Skipping upgrade.');
      return;
    }
  } catch (e) {
    console.warn('Failed to check if EHMarket is already upgraded to V2:', e.message);
  }

  await deployer.upgradeProxy('EHMarket', 'contracts/EHMarketV2.sol:EHMarketV2', {
    unsafeAllow: ['constructor'],
    unsafeSkipStorageCheck: true,
    initializer: 'migrateToV2',
    args: [initialWithdrawLimits],
  });
});

module.exports.tags = ['Upgradable', 'V2Upgrade'];
