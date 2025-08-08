const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
    await deployer.deployProxyImplementation('EHMarket', 'contracts/EHMarketV3.sol:EHMarketV3', {
        unsafeAllow: ['constructor'],
    });
});
module.exports.tags = ['Upgradable', 'UpgradeEHMarketV2ToV3'];