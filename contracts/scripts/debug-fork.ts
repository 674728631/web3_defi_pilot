import { ethers, network } from "hardhat"

async function main() {
  console.log("=== Fork Debug: depositAndExecute ===\n")

  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const adapterAddr = "0x757537A14C90b0F5fc34Df503Cd12cfABfFCc2Ae"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  // Impersonate the user
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [userAddr],
  })

  // Fund the impersonated account
  await network.provider.send("hardhat_setBalance", [
    userAddr,
    "0x56BC75E2D63100000", // 100 ETH
  ])

  const signer = await ethers.getSigner(userAddr)

  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr, signer)

  // Test deposit first
  console.log("1. Testing deposit()...")
  try {
    const tx1 = await vault.deposit({ value: ethers.parseEther("0.01"), gasLimit: 500_000 })
    const r1 = await tx1.wait()
    console.log("   deposit() SUCCESS, gas:", r1!.gasUsed.toString())
  } catch (e: any) {
    console.log("   deposit() FAILED:", e.reason || e.message)
  }

  // Step by step sub-calls
  console.log("\n2. Step-by-step sub-calls of depositAndExecute:")

  const adapter = await ethers.getContractAt("AaveV3Adapter", adapterAddr)
  const aWethAddr = "0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830"
  const aWeth = await ethers.getContractAt("IERC20", aWethAddr)

  // 2a. adapter.aWETH()
  try {
    const token = await adapter.aWETH()
    console.log("   2a. adapter.aWETH():", token)
  } catch (e: any) {
    console.log("   2a. adapter.aWETH() FAILED:", e.reason || e.message)
  }

  // 2b. aWETH.balanceOf(vault)
  try {
    const bal = await aWeth.balanceOf(vaultAddr)
    console.log("   2b. aWETH.balanceOf(vault):", bal.toString())
  } catch (e: any) {
    console.log("   2b. aWETH.balanceOf(vault) FAILED:", e.reason || e.message)
  }

  // 2c. adapter.depositETH(vault) - called BY the vault
  console.log("\n3. Simulating adapter.depositETH from vault context...")
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [vaultAddr],
  })
  await network.provider.send("hardhat_setBalance", [
    vaultAddr,
    "0x56BC75E2D63100000", // 100 ETH
  ])
  const vaultSigner = await ethers.getSigner(vaultAddr)
  const adapterAsVault = adapter.connect(vaultSigner)

  try {
    const tx3 = await adapterAsVault.depositETH(vaultAddr, {
      value: ethers.parseEther("0.001"),
      gasLimit: 500_000,
    })
    const r3 = await tx3.wait()
    console.log("   adapter.depositETH() SUCCESS, gas:", r3!.gasUsed.toString())
  } catch (e: any) {
    console.log("   adapter.depositETH() FAILED:")
    console.log("   reason:", e.reason || "none")
    const msg = e.message || ""
    console.log("   error (first 500 chars):", msg.substring(0, 500))
  }

  // 4. Check implementation bytecode has depositAndExecute
  const implAddr = "0x980e6905b99317fcb823e79d81647260c48b76fa"
  const implCode = await ethers.provider.getCode(implAddr)
  const hasSelector = implCode.toLowerCase().includes("cc4242da")
  console.log("\n4. Implementation has depositAndExecute selector:", hasSelector)
  console.log("   Implementation bytecode length:", implCode.length)

  // 5. Try calling implementation directly (not through proxy) — expect storage mismatch but should show if function exists
  console.log("\n5. Calling depositAndExecute on implementation directly...")
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [userAddr],
  })
  const userSigner2 = await ethers.getSigner(userAddr)
  const implVault = await ethers.getContractAt("DeFiPilotVault", implAddr, userSigner2)
  try {
    const tx5 = await implVault.depositAndExecute(adapterAddr, {
      value: ethers.parseEther("0.001"),
      gasLimit: 500_000,
    })
    const r5 = await tx5.wait()
    console.log("   impl.depositAndExecute() SUCCESS, gas:", r5!.gasUsed.toString())
  } catch (e: any) {
    console.log("   impl.depositAndExecute() FAILED:", e.reason || e.message?.substring(0, 200))
  }

  // 6. Try using low-level call to proxy
  console.log("\n6. Low-level call to proxy with depositAndExecute calldata...")
  const iface = new ethers.Interface(["function depositAndExecute(address protocol) payable"])
  const calldata = iface.encodeFunctionData("depositAndExecute", [adapterAddr])
  console.log("   Calldata:", calldata)
  console.log("   Calldata length:", (calldata.length - 2) / 2, "bytes")

  try {
    const result = await ethers.provider.call({
      from: userAddr,
      to: vaultAddr,
      data: calldata,
      value: ethers.parseEther("0.001"),
    })
    console.log("   eth_call result:", result)
  } catch (e: any) {
    console.log("   eth_call FAILED:", e.reason || e.message?.substring(0, 300))
    if (e.data) console.log("   revert data:", e.data)
  }

  // 7. Try a low-level tx
  console.log("\n7. Sending raw low-level tx...")
  try {
    const tx7 = await userSigner2.sendTransaction({
      to: vaultAddr,
      data: calldata,
      value: ethers.parseEther("0.001"),
      gasLimit: 500_000,
    })
    const r7 = await tx7.wait()
    console.log("   raw tx SUCCESS, gas:", r7!.gasUsed.toString())
  } catch (e: any) {
    console.log("   raw tx FAILED:", e.reason || e.message?.substring(0, 500))
    if (e.data) console.log("   revert data:", e.data)
  }
}

main().catch(console.error)
