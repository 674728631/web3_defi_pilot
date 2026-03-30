import { ethers } from "hardhat"

async function main() {
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const adapterAddr = "0x757537A14C90b0F5fc34Df503Cd12cfABfFCc2Ae"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"
  const gatewayAddr = "0x387d311e47e80b498169e6fb51d3193167d89F7D"
  const poolAddr = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"
  const aWethAddr = "0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830"

  // Impersonate user
  await ethers.provider.send("hardhat_impersonateAccount", [userAddr])
  await ethers.provider.send("hardhat_setBalance", [userAddr, "0x56BC75E2D63100000"])
  const user = await ethers.getSigner(userAddr)

  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr, user)
  const adapter = await ethers.getContractAt("AaveV3Adapter", adapterAddr, user)

  console.log("=== Pre-flight checks ===")
  console.log("Vault paused:", await vault.paused())
  console.log("Adapter whitelisted:", await vault.whitelistedProtocols(adapterAddr))
  console.log("Adapter vault:", await adapter.vault())
  console.log("Adapter gateway:", await adapter.gateway())
  console.log("Adapter pool:", await adapter.pool())
  console.log("Adapter aWETH:", await adapter.aWETH())

  // Check if gateway code exists
  const gwCode = await ethers.provider.getCode(gatewayAddr)
  console.log("Gateway has code:", gwCode.length > 2)

  // Step 1: Try direct gateway call
  console.log("\n=== Step 1: Direct Gateway.depositETH ===")
  const gwIface = new ethers.Interface(["function depositETH(address pool, address onBehalfOf, uint16 referralCode) external payable"])
  const gwCalldata = gwIface.encodeFunctionData("depositETH", [poolAddr, userAddr, 0])
  try {
    const gwResult = await ethers.provider.call({
      from: userAddr,
      to: gatewayAddr,
      data: gwCalldata,
      value: ethers.parseEther("0.001"),
    })
    console.log("Gateway.depositETH staticCall OK:", gwResult)
  } catch (e: any) {
    console.log("Gateway.depositETH staticCall FAILED:", e.message?.slice(0, 200))
  }

  // Step 2: Try adapter.depositETH from vault context
  console.log("\n=== Step 2: Adapter.depositETH from Vault ===")
  await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr])
  await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"])
  const vaultSigner = await ethers.getSigner(vaultAddr)
  const adapterAsVault = adapter.connect(vaultSigner)
  try {
    const tx = await adapterAsVault.depositETH(vaultAddr, { value: ethers.parseEther("0.001") })
    const receipt = await tx.wait()
    console.log("Adapter.depositETH OK! gas:", receipt?.gasUsed.toString())
  } catch (e: any) {
    console.log("Adapter.depositETH FAILED:", e.message?.slice(0, 500))
  }

  // Step 3: Try full depositAndExecute
  console.log("\n=== Step 3: Vault.depositAndExecute ===")
  try {
    const tx = await vault.depositAndExecute(adapterAddr, { value: ethers.parseEther("0.001") })
    const receipt = await tx.wait()
    console.log("depositAndExecute OK! gas:", receipt?.gasUsed.toString())
  } catch (e: any) {
    console.log("depositAndExecute FAILED:", e.message?.slice(0, 500))
  }
}

main().catch(console.error)
