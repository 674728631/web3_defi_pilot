import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

describe("UUPS Upgrade Flow", function () {
  async function deployFixture() {
    const [owner, user, attacker] = await ethers.getSigners()

    const Vault = await ethers.getContractFactory("DeFiPilotVault")
    const vault = await upgrades.deployProxy(Vault, [], { kind: "uups" })
    const vaultAddr = await vault.getAddress()

    const Executor = await ethers.getContractFactory("IntentExecutor")
    const executor = await upgrades.deployProxy(Executor, [vaultAddr], { kind: "uups" })

    await vault.setIntentExecutor(await executor.getAddress())
    await executor.setSolver(owner.address, true)

    return { vault, executor, owner, user, attacker }
  }

  describe("DeFiPilotVault Upgrade", function () {
    it("should preserve state after upgrade to V2", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      const depositAmount = ethers.parseEther("5.0")

      await vault.connect(user).deposit({ value: depositAmount })
      expect(await vault.getUserBalance(user.address)).to.equal(depositAmount)

      const proxyAddr = await vault.getAddress()

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2")
      const vaultV2 = await upgrades.upgradeProxy(proxyAddr, VaultV2)

      expect(await vaultV2.getAddress()).to.equal(proxyAddr)
      expect(await vaultV2.getUserBalance(user.address)).to.equal(depositAmount)
      expect(await vaultV2.totalEthBalance()).to.equal(depositAmount)

      expect(await vaultV2.version()).to.equal(2)
    })

    it("should support new V2 features after upgrade", async function () {
      const { vault, owner } = await loadFixture(deployFixture)
      const proxyAddr = await vault.getAddress()

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2")
      const vaultV2 = await upgrades.upgradeProxy(proxyAddr, VaultV2)

      expect(await vaultV2.emergencyMode()).to.equal(false)
      await vaultV2.connect(owner).setEmergencyMode(true)
      expect(await vaultV2.emergencyMode()).to.equal(true)
    })

    it("should reject upgrade from non-owner", async function () {
      const { vault, attacker } = await loadFixture(deployFixture)
      const proxyAddr = await vault.getAddress()

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2", attacker)

      await expect(
        upgrades.upgradeProxy(proxyAddr, VaultV2)
      ).to.be.reverted
    })

    it("should preserve owner after upgrade", async function () {
      const { vault, owner } = await loadFixture(deployFixture)
      const proxyAddr = await vault.getAddress()

      const originalOwner = await vault.owner()

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2")
      const vaultV2 = await upgrades.upgradeProxy(proxyAddr, VaultV2)

      expect(await vaultV2.owner()).to.equal(originalOwner)
      expect(await vaultV2.owner()).to.equal(owner.address)
    })

    it("V1 functions should still work after upgrade", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      const proxyAddr = await vault.getAddress()

      await vault.connect(user).deposit({ value: ethers.parseEther("2.0") })

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2")
      const vaultV2 = await upgrades.upgradeProxy(proxyAddr, VaultV2)

      await vaultV2.connect(user).deposit({ value: ethers.parseEther("3.0") })
      expect(await vaultV2.getUserBalance(user.address)).to.equal(ethers.parseEther("5.0"))

      await vaultV2.connect(user).withdraw(ethers.parseEther("1.0"))
      expect(await vaultV2.getUserBalance(user.address)).to.equal(ethers.parseEther("4.0"))
    })
  })

  describe("IntentExecutor Upgrade", function () {
    it("should preserve state after upgrade to V2", async function () {
      const { executor, owner, user } = await loadFixture(deployFixture)
      const proxyAddr = await executor.getAddress()

      expect(await executor.solvers(owner.address)).to.equal(true)

      const ExecutorV2 = await ethers.getContractFactory("IntentExecutorV2")
      const executorV2 = await upgrades.upgradeProxy(proxyAddr, ExecutorV2)

      expect(await executorV2.getAddress()).to.equal(proxyAddr)
      expect(await executorV2.solvers(owner.address)).to.equal(true)
      expect(await executorV2.version()).to.equal(2)
    })

    it("should reject upgrade from non-owner", async function () {
      const { executor, attacker } = await loadFixture(deployFixture)
      const proxyAddr = await executor.getAddress()

      const ExecutorV2 = await ethers.getContractFactory("IntentExecutorV2", attacker)

      await expect(
        upgrades.upgradeProxy(proxyAddr, ExecutorV2)
      ).to.be.reverted
    })
  })

  describe("Proxy Address Stability", function () {
    it("proxy address should remain unchanged after upgrade", async function () {
      const { vault } = await loadFixture(deployFixture)
      const proxyAddr = await vault.getAddress()

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2")
      const vaultV2 = await upgrades.upgradeProxy(proxyAddr, VaultV2)

      expect(await vaultV2.getAddress()).to.equal(proxyAddr)
    })
  })

  describe("Initializer Protection", function () {
    it("should reject re-initialization on proxy", async function () {
      const { vault } = await loadFixture(deployFixture)

      await expect(vault.initialize()).to.be.reverted
    })

    it("should reject re-initialization after upgrade", async function () {
      const { vault } = await loadFixture(deployFixture)
      const proxyAddr = await vault.getAddress()

      const VaultV2 = await ethers.getContractFactory("DeFiPilotVaultV2")
      const vaultV2 = await upgrades.upgradeProxy(proxyAddr, VaultV2)

      await expect(vaultV2.initialize()).to.be.reverted
    })
  })
})
