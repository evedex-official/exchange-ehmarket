const { expect } = require('chai');
const { ethers, upgrades, deployments } = require('hardhat');

describe('EHMarket Upgrade Process', function () {
  let container = {};

  before(async function () {
    const [owner, matcher1, matcher2, alice] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory('MockToken');
    const usdt = await MockToken.deploy('USDT', 'USDT', owner.address);
    const EHMarket = await ethers.getContractFactory('contracts/EHMarketV1.sol:EHMarketV1', owner);
    const market = await upgrades.deployProxy(
      EHMarket,
      [[matcher1.address, matcher2.address], await usdt.getAddress()],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );

    container = { owner, matcher1, matcher2, alice, usdt, market };
  });

  it('Should deploy V1 successfully', async function () {
    const { matcher1, usdt, market, owner } = container;
    expect(await market.collateral()).to.equal(await usdt.getAddress());
    expect(await market.hasRole(await market.MATCHER_ROLE(), matcher1.address)).to.be.true;
    expect(await market.hasRole(await market.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
  });

  it('Should allow deposits', async function () {
    const { alice, market, usdt } = container;
    await usdt.mint(alice.address, ethers.parseUnits('1000', 6));
    await usdt.connect(alice).approve(await market.getAddress(), ethers.parseUnits('100', 6));
    await market.connect(alice).depositAsset(ethers.parseUnits('100', 6));
  });

  it('Should upgrade to V2 and maintain state', async function () {
    const { matcher1, usdt, market } = container;
    const initialWithdrawLimits = [
      {
        limit: ethers.parseEther('10'),
        userLimit: ethers.parseEther('1'),
        timeWindow: 24,
      },
    ];
    const EHMarketV2 = await ethers.getContractFactory('contracts/EHMarketV2.sol:EHMarketV2');

    const marketV2 = await upgrades.upgradeProxy(await market.getAddress(), EHMarketV2, {
      unsafeAllow: ['constructor'],
      unsafeSkipStorageCheck: true,
      call: { fn: 'migrateToV2', args: [initialWithdrawLimits] },
    });

    expect(await marketV2.collateral()).to.equal(await usdt.getAddress());
    expect(await marketV2.hasRole(await marketV2.MATCHER_ROLE(), matcher1.address)).to.be.true;
    const withdrawLimit = await marketV2.withdrawLimits(0);
    expect(withdrawLimit.limit).to.equal(ethers.parseEther('10'));
    expect(withdrawLimit.userLimit).to.equal(ethers.parseEther('1'));
    expect(withdrawLimit.timeWindow).to.equal(24);
    container.market = marketV2; // Update container to use the new market instance
  });

  it('should ban migrateV2 second call', async function () {
    const { market } = container;
    await expect(market.migrateToV2([])).to.be.revertedWith('Already migrated to V2');
  });
});
