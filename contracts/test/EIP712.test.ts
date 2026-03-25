import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

/**
 * EIP-712 签名验证测试套件
 *
 * 测试 executeBatchWithSig 的完整签名流程：
 *   - 用户链下签名 → Solver 携带签名上链 → 合约验签 → 执行策略
 *   - 过期签名拒绝
 *   - nonce 重放拒绝
 *   - 错误签名拒绝
 *   - 原始 executeBatch 向后兼容
 */
describe("EIP-712 Signature Verification", function () {
  async function deployFixture() {
    const [owner, user, solver, protocol] = await ethers.getSigners()

    const Vault = await ethers.getContractFactory("DeFiPilotVault")
    const vault = await upgrades.deployProxy(Vault, [], { kind: "uups" })

    const Executor = await ethers.getContractFactory("IntentExecutor")
    const executor = await upgrades.deployProxy(Executor, [await vault.getAddress()], { kind: "uups" })

    await vault.setIntentExecutor(await executor.getAddress())
    await vault.whitelistProtocol(protocol.address, true)
    await executor.setSolver(solver.address, true)

    await vault.connect(user).deposit({ value: ethers.parseEther("10.0") })

    const chainId = (await ethers.provider.getNetwork()).chainId
    const executorAddr = await executor.getAddress()

    const domain = {
      name: "DeFiPilot",
      version: "1",
      chainId: chainId,
      verifyingContract: executorAddr,
    }

    const types = {
      ExecuteBatch: [
        { name: "user", type: "address" },
        { name: "intentsHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    return { vault, executor, owner, user, solver, protocol, domain, types }
  }

  function hashIntents(intents: { protocol: string; amount: bigint; data: string }[]) {
    const INTENT_TYPEHASH = ethers.keccak256(
      ethers.toUtf8Bytes("Intent(address protocol,uint256 amount,bytes data)")
    )
    const hashes = intents.map((intent) =>
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "uint256", "bytes32"],
          [INTENT_TYPEHASH, intent.protocol, intent.amount, ethers.keccak256(intent.data)]
        )
      )
    )
    return ethers.keccak256(ethers.solidityPacked(["bytes32[]"], [hashes]))
  }

  it("should execute with valid user signature", async function () {
    const { vault, executor, user, solver, protocol, domain, types } =
      await loadFixture(deployFixture)

    const intents = [
      {
        protocol: protocol.address,
        amount: ethers.parseEther("1.0"),
        data: "0x",
      },
    ]
    const deadline = Math.floor(Date.now() / 1000) + 3600
    const nonce = await executor.nonces(user.address)

    const intentsHash = hashIntents(intents)

    const message = {
      user: user.address,
      intentsHash,
      nonce,
      deadline,
    }

    const signature = await user.signTypedData(domain, types, message)

    await executor.connect(solver).executeBatchWithSig(user.address, intents, deadline, signature)

    expect(await vault.getUserBalance(user.address)).to.equal(ethers.parseEther("9.0"))
    expect(await executor.nonces(user.address)).to.equal(1)
  })

  it("should reject expired signature", async function () {
    const { executor, user, solver, protocol, domain, types } =
      await loadFixture(deployFixture)

    const intents = [{ protocol: protocol.address, amount: ethers.parseEther("1.0"), data: "0x" }]
    const deadline = 1
    const nonce = await executor.nonces(user.address)
    const intentsHash = hashIntents(intents)

    const signature = await user.signTypedData(domain, types, {
      user: user.address,
      intentsHash,
      nonce,
      deadline,
    })

    await expect(
      executor.connect(solver).executeBatchWithSig(user.address, intents, deadline, signature)
    ).to.be.revertedWith("Signature expired")
  })

  it("should reject wrong signer (signer != user)", async function () {
    const { executor, user, solver, owner, protocol, domain, types } =
      await loadFixture(deployFixture)

    const intents = [{ protocol: protocol.address, amount: ethers.parseEther("1.0"), data: "0x" }]
    const deadline = Math.floor(Date.now() / 1000) + 3600
    const nonce = await executor.nonces(user.address)
    const intentsHash = hashIntents(intents)

    const signature = await owner.signTypedData(domain, types, {
      user: user.address,
      intentsHash,
      nonce,
      deadline,
    })

    await expect(
      executor.connect(solver).executeBatchWithSig(user.address, intents, deadline, signature)
    ).to.be.revertedWith("Invalid signature")
  })

  it("should reject replay (same nonce used twice)", async function () {
    const { executor, user, solver, protocol, domain, types } =
      await loadFixture(deployFixture)

    const intents = [{ protocol: protocol.address, amount: ethers.parseEther("1.0"), data: "0x" }]
    const deadline = Math.floor(Date.now() / 1000) + 3600
    const nonce = await executor.nonces(user.address)
    const intentsHash = hashIntents(intents)

    const signature = await user.signTypedData(domain, types, {
      user: user.address,
      intentsHash,
      nonce,
      deadline,
    })

    await executor.connect(solver).executeBatchWithSig(user.address, intents, deadline, signature)

    await expect(
      executor.connect(solver).executeBatchWithSig(user.address, intents, deadline, signature)
    ).to.be.revertedWith("Invalid signature")
  })

  it("original executeBatch should still work (backward compatible)", async function () {
    const { vault, executor, solver, user, protocol } = await loadFixture(deployFixture)

    const intents = [{ protocol: protocol.address, amount: ethers.parseEther("1.0"), data: "0x" }]

    await executor.connect(solver).executeBatch(user.address, intents)
    expect(await vault.getUserBalance(user.address)).to.equal(ethers.parseEther("9.0"))
  })
})
