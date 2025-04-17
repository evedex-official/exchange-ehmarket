import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import hre, { ethers } from "hardhat";
import { describe, it } from "node:test";

describe("EventHorizon", function () {
  async function deployEhMarketFixture() {
    const [owner, matcher1, matcher2, alice, bob] =
      await hre.ethers.getSigners();

    const MockToken = await hre.ethers.getContractFactory("MockToken");
    const usdt = await MockToken.deploy("USDT", "USDT", owner.address);

    await usdt.mint(owner.address, ethers.parseEther("1000000"));
    await usdt.mint(alice.address, ethers.parseEther("1000"));
    await usdt.mint(bob.address, ethers.parseEther("1000"));

    const EHMarket = await hre.ethers.getContractFactory("EHMarket");
    const market = await EHMarket.deploy(
      [matcher1.address, matcher2.address],
      usdt.address,
    );

    return { owner, matcher1, matcher2, market, usdt, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set initial params", async function () {
      const { market, usdt, matcher1, matcher2 } = await loadFixture(
        deployEhMarketFixture,
      );

      const collateral = await market.COLLATERAL();
      expect(collateral).to.equal(usdt.address, "wrong collateral address");

      const matcherRole = await market.MATCHER_ROLE();
      const hasMatcher1Role = await market.hasRole(
        matcherRole,
        matcher1.address,
      );

      expect(hasMatcher1Role).to.be.true;
      const hasMatcher2Role = await market.hasRole(
        matcherRole,
        matcher2.address,
      );
      expect(hasMatcher2Role).to.be.true;
    });
  });

  describe("User functions", async function () {
    it("should deposit tokens", async function () {
      const { alice, market, usdt } = await loadFixture(deployEhMarketFixture);

      const amount = ethers.parseEther("1000");
      await usdt.connect(alice).approve(market.address, amount);
      await market.connect(alice).depositAsset(amount);

      const aliceBalance = await market.getUserBalance(alice.address);

      expect(aliceBalance.toString()).to.equal(
        amount.toString(),
        "wrong deposited amount",
      );
    });

    it("should deposit tokens to another account", async function () {
      const { alice, bob, market, usdt } = await loadFixture(
        deployEhMarketFixture,
      );

      const amount = ethers.parseEther("1000");
      await usdt.connect(alice).approve(market.address, amount);

      await market.connect(alice).depositAssetTo(bob.address, amount);

      const bobBalance = await market.getUserBalance(bob.address);

      expect(bobBalance.toString()).to.equal(
        amount.toString(),
        "wrong deposited amount",
      );
    });

    it("should withdraw tokens with signature", async function () {
      const deadline = await ethers.provider
        .getBlock("latest")
        .then((block) => (block?.timestamp ?? 0) + 60 * 60); // 1 hour later

      const { alice, bob, market, usdt, matcher1 } = await loadFixture(
        deployEhMarketFixture,
      );

      const amount = ethers.parseEther("1000");
      await usdt.connect(alice).approve(market.address, amount);
      await market.connect(alice).depositAsset(amount);

      const digest = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "address", "address", "uint256"],
          [alice.address, amount, matcher1.address, market.address, deadline],
        ),
      );

      const signature = await matcher1.signMessage(ethers.getBytes(digest));

      await market.withdrawAsset(
        alice.address,
        amount,
        matcher1.address,
        deadline,
        signature,
      );
    });
  });
});
