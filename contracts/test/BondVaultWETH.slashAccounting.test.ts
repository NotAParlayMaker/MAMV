import { expect } from "chai";
import { ethers } from "hardhat";

describe("BondVaultWETH slash accounting", function () {
  const taskIds = ["first", "second", "third"].map(ethers.id);

  async function fixture(deposit: bigint, locks: bigint[]) {
    const [owner, marketplace, disputeLadder, user, recipient] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockERC20")).deploy("WETH", "WETH");
    const vault = await (await ethers.getContractFactory("BondVaultWETH")).deploy(
      await token.getAddress(), marketplace.address, disputeLadder.address
    );
    await token.mint(user.address, deposit);
    await token.connect(user).approve(await vault.getAddress(), deposit);
    await vault.connect(user).deposit(deposit);
    for (let i = 0; i < locks.length; i++) {
      await vault.connect(marketplace).lockBond(taskIds[i], user.address, locks[i]);
    }
    return { owner, marketplace, disputeLadder, user, recipient, token, vault };
  }

  it("unlocks both task balances after a slash without aggregate underflow", async function () {
    const { vault, marketplace, disputeLadder, user, recipient } = await fixture(8n, [4n, 4n]);
    await vault.connect(disputeLadder).slashBond(ethers.id("dispute"), user.address, 4n, recipient.address);
    for (const taskId of taskIds.slice(0, 2)) {
      const remaining = await vault.lockedBondOf(taskId, user.address);
      await vault.connect(marketplace).unlockBond(taskId, user.address, remaining);
    }
    expect(await vault.totalLockedOf(user.address)).to.equal(0n);
    expect(await vault.freeBondOf(user.address)).to.equal(4n);
    await vault.connect(user).withdraw(4n);
  });

  for (const scenario of [
    { name: "partially locked bonds", deposit: 10n, locks: [5n, 3n], slash: 5n },
    { name: "fully locked bonds", deposit: 8n, locks: [5n, 3n], slash: 3n },
    { name: "rounding across tiny task bonds", deposit: 3n, locks: [1n, 1n, 1n], slash: 1n },
    { name: "a reduction rounded down to zero", deposit: 10n, locks: [1n, 1n], slash: 1n },
    { name: "a full slash", deposit: 10n, locks: [5n, 3n], slash: 10n },
    { name: "a slash capped at the deposited balance", deposit: 10n, locks: [5n, 3n], slash: 20n },
    { name: "free bonds only", deposit: 10n, locks: [], slash: 3n },
  ]) {
    it(`keeps task locks consistent and unlockable after ${scenario.name}`, async function () {
      const { vault, token, marketplace, disputeLadder, user, recipient } =
        await fixture(scenario.deposit, scenario.locks);
      const slash = scenario.slash > scenario.deposit ? scenario.deposit : scenario.slash;
      const lockedBefore = scenario.locks.reduce((sum, amount) => sum + amount, 0n);
      const expectedLocked = lockedBefore - lockedBefore * slash / scenario.deposit;
      await vault.connect(disputeLadder).slashBond(ethers.id("dispute"), user.address, scenario.slash, recipient.address);

      const remaining = await Promise.all(taskIds.map(id => vault.lockedBondOf(id, user.address)));
      expect(remaining.reduce((sum, amount) => sum + amount, 0n)).to.equal(expectedLocked);
      expect(await vault.totalLockedOf(user.address)).to.equal(expectedLocked);
      expect(await vault.totalBondOf(user.address)).to.equal(scenario.deposit - slash);
      expect(await token.balanceOf(recipient.address)).to.equal(slash);
      expect(await vault.freeBondOf(user.address)).to.equal(scenario.deposit - slash - expectedLocked);

      for (let i = 0; i < taskIds.length; i++) {
        if (remaining[i] > 0n) {
          await vault.connect(marketplace).unlockBond(taskIds[i], user.address, remaining[i]);
        }
        expect(await vault.lockedBondOf(taskIds[i], user.address)).to.equal(0n);
      }
      expect(await vault.totalLockedOf(user.address)).to.equal(0n);
      const free = await vault.freeBondOf(user.address);
      if (free > 0n) await vault.connect(user).withdraw(free);
      expect(await token.balanceOf(await vault.getAddress())).to.equal(0n);
      expect(await token.balanceOf(user.address)).to.equal(scenario.deposit - slash);
    });
  }

  it("tracks repeated locks, partial unlocks, removed tasks, and relocked tasks", async function () {
    const { vault, token, marketplace, disputeLadder, user, recipient } = await fixture(20n, [4n, 6n]);
    await vault.connect(marketplace).lockBond(taskIds[0], user.address, 2n);
    await vault.connect(marketplace).unlockBond(taskIds[0], user.address, 1n);
    await vault.connect(marketplace).unlockBond(taskIds[1], user.address, 6n);
    await vault.connect(marketplace).lockBond(taskIds[1], user.address, 3n);

    for (const amount of [5n, 4n]) {
      await vault.connect(disputeLadder).slashBond(ethers.id("dispute"), user.address, amount, recipient.address);
      const locks = await Promise.all(taskIds.map(id => vault.lockedBondOf(id, user.address)));
      expect(locks.reduce((sum, value) => sum + value, 0n)).to.equal(await vault.totalLockedOf(user.address));
    }
    // Fully deplete the active set, then exercise a fresh lock and slash.
    await vault.connect(disputeLadder).slashBond(ethers.id("dispute"), user.address, 100n, recipient.address);
    await token.mint(user.address, 10n);
    await token.connect(user).approve(await vault.getAddress(), 10n);
    await vault.connect(user).deposit(10n);
    await vault.connect(marketplace).lockBond(taskIds[0], user.address, 10n);
    await vault.connect(disputeLadder).slashBond(ethers.id("dispute"), user.address, 3n, recipient.address);
    expect(await vault.lockedBondOf(taskIds[0], user.address)).to.equal(7n);
    expect(await vault.totalLockedOf(user.address)).to.equal(7n);
    await vault.connect(marketplace).unlockBond(taskIds[0], user.address, 7n);
    await vault.connect(user).withdraw(7n);
    expect(await token.balanceOf(await vault.getAddress())).to.equal(0n);
  });
});
