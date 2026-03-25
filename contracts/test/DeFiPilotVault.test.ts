import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

// ═══════════════════════════════════════════════════════════
//  DeFiPilotVault 核心测试
// ═══════════════════════════════════════════════════════════

describe("DeFiPilotVault", function () {
  async function deployFixture() {
    const [owner, user, protocol] = await ethers.getSigners()

    const Vault = await ethers.getContractFactory("DeFiPilotVault")
    const vault = await upgrades.deployProxy(Vault, [], { kind: "uups" })

    const Executor = await ethers.getContractFactory("IntentExecutor")
    const executor = await upgrades.deployProxy(Executor, [await vault.getAddress()], { kind: "uups" })

    await vault.setIntentExecutor(await executor.getAddress())
    await vault.whitelistProtocol(protocol.address, true)
    await executor.setSolver(owner.address, true)

    return { vault, executor, owner, user, protocol }
  }

  describe("Deposit & Withdraw", function () {
    it("should accept ETH deposits and track totalEthBalance", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      const amount = ethers.parseEther("1.0")

      await vault.connect(user).deposit({ value: amount })
      expect(await vault.getUserBalance(user.address)).to.equal(amount)
      expect(await vault.totalEthBalance()).to.equal(amount)
    })

    it("should allow withdrawals and decrease totalEthBalance", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      const amount = ethers.parseEther("1.0")

      await vault.connect(user).deposit({ value: amount })
      await vault.connect(user).withdraw(amount)
      expect(await vault.getUserBalance(user.address)).to.equal(0)
      expect(await vault.totalEthBalance()).to.equal(0)
    })

    it("should reject withdrawal exceeding balance", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      await vault.connect(user).deposit({ value: ethers.parseEther("1.0") })
      await expect(
        vault.connect(user).withdraw(ethers.parseEther("2.0"))
      ).to.be.revertedWith("Insufficient balance")
    })

    it("receive() should NOT auto-deposit (avoid Aave ETH return miscount)", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      const amount = ethers.parseEther("0.5")
      await user.sendTransaction({ to: await vault.getAddress(), value: amount })
      expect(await vault.getUserBalance(user.address)).to.equal(0)
    })
  })

  describe("Access Control", function () {
    it("should only allow owner to whitelist protocols", async function () {
      const { vault, user, protocol } = await loadFixture(deployFixture)
      await expect(
        vault.connect(user).whitelistProtocol(protocol.address, true)
      ).to.be.reverted
    })

    it("should only allow owner to set executor", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      await expect(
        vault.connect(user).setIntentExecutor(user.address)
      ).to.be.reverted
    })
  })

  describe("Health Factor", function () {
    it("should report healthy when balance matches", async function () {
      const { vault, user } = await loadFixture(deployFixture)
      await vault.connect(user).deposit({ value: ethers.parseEther("2.0") })

      const [actual, accounted, healthy] = await vault.getHealthFactor()
      expect(healthy).to.equal(true)
      expect(actual).to.be.gte(accounted)
    })
  })
})

// ═══════════════════════════════════════════════════════════
//  IntentExecutor 测试
// ═══════════════════════════════════════════════════════════

describe("IntentExecutor", function () {
  async function deployFixture() {
    const [owner, user, solver] = await ethers.getSigners()

    const Vault = await ethers.getContractFactory("DeFiPilotVault")
    const vault = await upgrades.deployProxy(Vault, [], { kind: "uups" })

    const Executor = await ethers.getContractFactory("IntentExecutor")
    const executor = await upgrades.deployProxy(Executor, [await vault.getAddress()], { kind: "uups" })

    await vault.setIntentExecutor(await executor.getAddress())
    await executor.setSolver(solver.address, true)

    return { vault, executor, owner, user, solver }
  }

  describe("Solver Management", function () {
    it("should allow owner to add solvers", async function () {
      const { executor, solver } = await loadFixture(deployFixture)
      expect(await executor.solvers(solver.address)).to.equal(true)
    })

    it("should reject non-solver batch execution", async function () {
      const { executor, user } = await loadFixture(deployFixture)
      await expect(
        executor.connect(user).executeBatch(user.address, [])
      ).to.be.revertedWith("Not a solver")
    })
  })
})

// ═══════════════════════════════════════════════════════════
//  Aave V3 完整链路集成测试
// ═══════════════════════════════════════════════════════════

describe("Aave V3 Integration", function () {
  async function deployAaveFixture() {
    const [owner, user] = await ethers.getSigners()

    const MockAToken = await ethers.getContractFactory("MockAToken")
    const aToken = await MockAToken.deploy()

    const MockGateway = await ethers.getContractFactory("MockWETHGateway")
    const gateway = await MockGateway.deploy(await aToken.getAddress())
    await aToken.setGateway(await gateway.getAddress())

    await owner.sendTransaction({
      to: await gateway.getAddress(),
      value: ethers.parseEther("100"),
    })

    const Vault = await ethers.getContractFactory("DeFiPilotVault")
    const vault = await upgrades.deployProxy(Vault, [], { kind: "uups" })

    const Adapter = await ethers.getContractFactory("AaveV3Adapter")
    const adapter = await upgrades.deployProxy(
      Adapter,
      [await gateway.getAddress(), ethers.ZeroAddress, await aToken.getAddress()],
      { kind: "uups" }
    )

    await vault.whitelistProtocol(await adapter.getAddress(), true)
    await adapter.setVault(await vault.getAddress())

    return { vault, adapter, aToken, gateway, owner, user }
  }

  describe("depositAndExecute", function () {
    it("should deposit ETH via Adapter and receive aToken to Vault", async function () {
      const { vault, adapter, aToken, user } = await loadFixture(deployAaveFixture)
      const amount = ethers.parseEther("2.0")

      await vault.connect(user).depositAndExecute(
        await adapter.getAddress(),
        { value: amount }
      )

      expect(await aToken.balanceOf(await vault.getAddress())).to.equal(amount)

      const pos = await vault.getUserPosition(user.address, 0)
      expect(pos.protocol).to.equal(await adapter.getAddress())
      expect(pos.amount).to.equal(amount)
      expect(pos.receivedToken).to.equal(await aToken.getAddress())
      expect(pos.receivedAmount).to.equal(amount)
      expect(pos.active).to.equal(true)

      expect(await vault.getUserBalance(user.address)).to.equal(0)
    })

    it("should reject unwhitelisted protocol", async function () {
      const { vault, user } = await loadFixture(deployAaveFixture)
      await expect(
        vault.connect(user).depositAndExecute(
          user.address,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWith("Not whitelisted")
    })

    it("should reject zero value", async function () {
      const { vault, adapter, user } = await loadFixture(deployAaveFixture)
      await expect(
        vault.connect(user).depositAndExecute(
          await adapter.getAddress(),
          { value: 0 }
        )
      ).to.be.revertedWith("Zero value")
    })
  })

  describe("withdrawFromProtocol", function () {
    it("should redeem aToken for ETH and credit user ethBalance", async function () {
      const { vault, adapter, aToken, user } = await loadFixture(deployAaveFixture)
      const amount = ethers.parseEther("2.0")

      await vault.connect(user).depositAndExecute(
        await adapter.getAddress(),
        { value: amount }
      )

      await vault.connect(user).withdrawFromProtocol(0)

      const pos = await vault.getUserPosition(user.address, 0)
      expect(pos.active).to.equal(false)

      expect(await vault.getUserBalance(user.address)).to.equal(amount)
      expect(await vault.totalEthBalance()).to.equal(amount)

      expect(await aToken.balanceOf(await vault.getAddress())).to.equal(0)
    })

    it("should return more ETH when interest has accrued", async function () {
      const { vault, adapter, gateway, user } = await loadFixture(deployAaveFixture)
      const amount = ethers.parseEther("2.0")

      await vault.connect(user).depositAndExecute(
        await adapter.getAddress(),
        { value: amount }
      )

      await gateway.setWithdrawRate(10500)

      await vault.connect(user).withdrawFromProtocol(0)

      const expectedReturn = ethers.parseEther("2.1")
      expect(await vault.getUserBalance(user.address)).to.equal(expectedReturn)
    })

    it("should reject double withdrawal (same positionId)", async function () {
      const { vault, adapter, user } = await loadFixture(deployAaveFixture)
      const amount = ethers.parseEther("1.0")

      await vault.connect(user).depositAndExecute(
        await adapter.getAddress(),
        { value: amount }
      )

      await vault.connect(user).withdrawFromProtocol(0)

      await expect(
        vault.connect(user).withdrawFromProtocol(0)
      ).to.be.revertedWith("Not active")
    })

    it("should allow full cycle: depositAndExecute → withdrawFromProtocol → withdraw ETH", async function () {
      const { vault, adapter, user } = await loadFixture(deployAaveFixture)
      const amount = ethers.parseEther("3.0")

      await vault.connect(user).depositAndExecute(
        await adapter.getAddress(),
        { value: amount }
      )

      await vault.connect(user).withdrawFromProtocol(0)
      expect(await vault.getUserBalance(user.address)).to.equal(amount)

      const balanceBefore = await ethers.provider.getBalance(user.address)
      const tx = await vault.connect(user).withdraw(amount)
      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice
      const balanceAfter = await ethers.provider.getBalance(user.address)

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(amount)
      expect(await vault.getUserBalance(user.address)).to.equal(0)
      expect(await vault.totalEthBalance()).to.equal(0)
    })
  })
})
