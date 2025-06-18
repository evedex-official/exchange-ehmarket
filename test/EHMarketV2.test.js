const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('EHMarketV2', function () {
  let container = {};
  before(async function () {
    const [owner, matcher1, matcher2, alice, bob, carol] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory('MockToken');
    const usdt = await MockToken.deploy('USDT', 'USDT', owner.address);
    await usdt.mint(owner.address, ethers.parseEther('1000000'));
    await usdt.mint(alice.address, ethers.parseEther('1000000'));
    await usdt.mint(bob.address, ethers.parseEther('1000000'));
    await usdt.mint(carol.address, ethers.parseEther('1000000'));
    const EHMarket = await ethers.getContractFactory('contracts/EHMarketV2.sol:EHMarketV2');
    const market = await upgrades.deployProxy(
      EHMarket,
      [[matcher1.address, matcher2.address], await usdt.getAddress(), []],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );
    container = { owner, matcher1, matcher2, market, usdt, alice, bob, carol };
  });

  describe('Deployment', function () {
    it('should deploy correctly', async function () {
      const { market } = container;
      expect(await market.getAddress()).to.properAddress;
    });

    it('Should set initial params', async function () {
      const { market, usdt, matcher1, matcher2 } = container;
      console.log(await market.getAddress());

      const collateral = await market.collateral();
      expect(collateral).to.equal(await usdt.getAddress(), 'wrong collateral address');

      const matcherRole = await market.MATCHER_ROLE();
      const hasMatcher1Role = await market.hasRole(matcherRole, matcher1.address);

      expect(hasMatcher1Role).to.be.true;
      const hasMatcher2Role = await market.hasRole(matcherRole, matcher2.address);
      expect(hasMatcher2Role).to.be.true;
    });
  });

  describe('basic user interaction', async function () {
    it('should deposit tokens', async function () {
      const { alice, market, usdt } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await expect(market.connect(alice).depositAsset(amount))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), amount, 0);
    });

    it('should deposit tokens to another account', async function () {
      const { alice, bob, market, usdt } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await expect(market.connect(alice).depositAssetTo(await bob.getAddress(), amount))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await bob.getAddress(), amount, 0);
    });

    it('should withdraw tokens with signature', async function () {
      const deadline = await ethers.provider.getBlock('latest').then((block) => (block?.timestamp ?? 0) + 60 * 60); // 1 hour later

      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      await expect(market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, 1))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), `-${amount.toString()}`, 1);
    });

    it('should allow admin to add matcher', async function () {
      const { owner, market, alice } = container;
      const matcherRole = await market.MATCHER_ROLE();
      expect(await market.hasRole(matcherRole, alice.address)).to.be.false;
      await expect(market.connect(owner).grantRole(matcherRole, alice.address))
        .to.emit(market, 'RoleGranted')
        .withArgs(matcherRole, alice.address, owner.address);
      expect(await market.hasRole(matcherRole, alice.address)).to.be.true;
    });

    it('should allow admin to add another admin', async function () {
      const { owner, market, bob } = container;
      const adminRole = await market.DEFAULT_ADMIN_ROLE();
      expect(await market.hasRole(adminRole, bob.address)).to.be.false;
      await expect(market.connect(owner).grantRole(adminRole, bob.address))
        .to.emit(market, 'RoleGranted')
        .withArgs(adminRole, bob.address, owner.address);
      expect(await market.hasRole(adminRole, bob.address)).to.be.true;
    });

    it('should allow admin to remove matcher', async function () {
      const { owner, market, alice } = container;
      const matcherRole = await market.MATCHER_ROLE();
      expect(await market.hasRole(matcherRole, alice.address)).to.be.true;
      await expect(market.connect(owner).revokeRole(matcherRole, alice.address))
        .to.emit(market, 'RoleRevoked')
        .withArgs(matcherRole, alice.address, owner.address);
      expect(await market.hasRole(matcherRole, alice.address)).to.be.false;
    });

    it('should allow admin to remove another admin', async function () {
      const { owner, market, bob } = container;
      const adminRole = await market.DEFAULT_ADMIN_ROLE();
      expect(await market.hasRole(adminRole, bob.address)).to.be.true;
      await expect(market.connect(owner).revokeRole(adminRole, bob.address))
        .to.emit(market, 'RoleRevoked')
        .withArgs(adminRole, bob.address, owner.address);
      expect(await market.hasRole(adminRole, bob.address)).to.be.false;
    });
  });

  describe('withdraw limits', async function () {
    beforeEach(async function () {
      const { owner, market } = container;
      await market.connect(owner).setWithdrawLimits([]);
      await ethers.provider.send('evm_increaseTime', [3600 * 24 * 365]);
      await ethers.provider.send('evm_mine');
    });

    it('should set withdraw limits', async function () {
      const { owner, market } = container;
      const withdrawLimits = [
        { limit: ethers.parseEther('5000'), userLimit: ethers.parseEther('500'), timeWindow: 1 },
        { limit: ethers.parseEther('10000'), userLimit: ethers.parseEther('1000'), timeWindow: 6 },
      ];
      await expect(market.connect(owner).setWithdrawLimits(withdrawLimits)).to.emit(market, 'WithdrawLimitsUpdated');
      const limit0 = await market.withdrawLimits(0);
      expect(limit0.limit).to.equal(withdrawLimits[0].limit);
      expect(limit0.userLimit).to.equal(withdrawLimits[0].userLimit);
      expect(limit0.timeWindow).to.equal(withdrawLimits[0].timeWindow);
      const limit1 = await market.withdrawLimits(1);
      expect(limit1.limit).to.equal(withdrawLimits[1].limit);
      expect(limit1.userLimit).to.equal(withdrawLimits[1].userLimit);
      expect(limit1.timeWindow).to.equal(withdrawLimits[1].timeWindow);
    });

    it('should enforce unique limits', async function () {
      const { owner, market } = container;
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('1'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('2'), timeWindow: 6 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('1'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('1'), timeWindow: 7 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 7 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      // correct usage
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('1'), timeWindow: 5 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 6 },
        ]),
      ).to.emit(market, 'WithdrawLimitsUpdated');
    });

    it('limits should be ordered in ascending order', async function () {
      const { owner, market } = container;
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('1'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('2'), timeWindow: 5 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');

      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('4'), userLimit: ethers.parseEther('1'), timeWindow: 5 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 6 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 5 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
    });

    it('should reject invalid withdraw limits', async function () {
      const { owner, market } = container;
      // Limit < userLimit
      await expect(
        market
          .connect(owner)
          .setWithdrawLimits([
            { limit: ethers.parseEther('100'), userLimit: ethers.parseEther('1000'), timeWindow: 6 },
          ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      // Zero limit
      await expect(
        market.connect(owner).setWithdrawLimits([{ limit: 0, userLimit: 0, timeWindow: 6 }]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      // Zero time window
      await expect(
        market
          .connect(owner)
          .setWithdrawLimits([
            { limit: ethers.parseEther('10000'), userLimit: ethers.parseEther('1000'), timeWindow: 0 },
          ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
    });

    it('should track withdrawals and enforce global limits', async function () {
      const { owner, market, matcher1, alice, bob, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('1000'), userLimit: ethers.parseEther('500'), timeWindow: 6 }]);
      // Deposit funds for Alice
      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      // Withdraw up to limit
      const withdrawAmount = ethers.parseEther('500');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), withdrawAmount, 1);
      // Check total withdrawals
      const totalWithdrawn = await market.getTotalWithdraw(
        6,
        await ethers.provider.getBlock('latest').then((b) => b.timestamp),
      );
      expect(totalWithdrawn).to.equal(withdrawAmount);

      // Deposit funds for Bob
      await usdt.connect(bob).approve(await market.getAddress(), depositAmount);
      await market.connect(bob).depositAsset(depositAmount);
      // First withdrawal should succeed (bringing total to 1000)
      await market.connect(matcher1).withdrawAsset(await bob.getAddress(), withdrawAmount, 2);
      // Next withdrawal should fail as it would exceed global limit
      await expect(
        market.connect(matcher1).withdrawAsset(await bob.getAddress(), withdrawAmount, 3),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');
    });

    it('should enforce per-user limits', async function () {
      const { owner, market, matcher1, alice, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('2000'), userLimit: ethers.parseEther('500'), timeWindow: 6 }]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      const withdrawAmount = ethers.parseEther('500');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), withdrawAmount, 1);

      const userWithdrawn = await market.getUserTotalWithdraw(
        6,
        await ethers.provider.getBlock('latest').then((b) => b.timestamp),
        await alice.getAddress(),
      );
      expect(userWithdrawn).to.equal(withdrawAmount);
      const smallAmount = ethers.parseEther('1');
      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), smallAmount, 2),
      ).to.be.revertedWithCustomError(market, 'UserLimitExceeded');
    });

    it('should correctly calculate max withdraw amount', async function () {
      const { owner, market, matcher1, alice, usdt } = container;

      await market.connect(owner).setWithdrawLimits([
        { limit: ethers.parseEther('200'), userLimit: ethers.parseEther('100'), timeWindow: 1 },
        { limit: ethers.parseEther('1000'), userLimit: ethers.parseEther('500'), timeWindow: 6 },
      ]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);

      let maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('100')); // Max amount is 100 (from 1-hour limit)
      expect(maxInfo[1]).to.equal(0); // Limiting index is 0 (the 1-hour limit)
      expect(maxInfo[2]).to.equal(true); // It's a user limit

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('50'), 1);
      // Check max withdraw amount after first withdrawal
      maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('50')); // Max amount is 50 (remaining from 1-hour limit)
    });

    it('should reset limits after time passes', async function () {
      const { owner, market, matcher1, alice, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('100'), userLimit: ethers.parseEther('100'), timeWindow: 1 }]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);

      // Withdraw up to hourly limit
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 1);

      // Additional withdrawal should fail
      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('1'), 2),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');

      // Move time forward by 1 hour
      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      // Now withdrawal should succeed
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 3);
    });

    it('should handle multiple time windows correctly', async function () {
      const { owner, market, matcher1, alice, usdt, bob, carol } = container;

      await market.connect(owner).setWithdrawLimits([
        { limit: ethers.parseEther('200'), userLimit: ethers.parseEther('100'), timeWindow: 1 },
        { limit: ethers.parseEther('300'), userLimit: ethers.parseEther('200'), timeWindow: 6 },
        { limit: ethers.parseEther('3000'), userLimit: ethers.parseEther('2000'), timeWindow: 24 },
      ]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      await usdt.connect(bob).approve(await market.getAddress(), depositAmount);
      await market.connect(bob).depositAsset(depositAmount);
      await usdt.connect(carol).approve(await market.getAddress(), depositAmount);
      await market.connect(carol).depositAsset(depositAmount);

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 1);
      // should fail due to 1-hour user limit
      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), 1, 2),
      ).to.be.revertedWithCustomError(market, 'UserLimitExceeded');

      await market.connect(matcher1).withdrawAsset(await bob.getAddress(), ethers.parseEther('100'), 3);

      // should fail due to 1-hour total limit
      await expect(
        market.connect(matcher1).withdrawAsset(await carol.getAddress(), ethers.parseEther('1'), 4),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');

      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      await market.connect(matcher1).withdrawAsset(await carol.getAddress(), ethers.parseEther('100'), 5);
      // should fail due to 6-hour total limit
      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('1'), 4),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');

      await ethers.provider.send('evm_increaseTime', [3600 * 6]);
      await ethers.provider.send('evm_mine');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 6);
      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 3);
      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');
      // should fail due to 6-hour user limit
      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('1'), 4),
      ).to.be.revertedWithCustomError(market, 'UserLimitExceeded');
    });
  });
});
