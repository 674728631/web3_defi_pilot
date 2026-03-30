import { ethers, network } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const addressesPath = path.join(__dirname, "..", "deployed-addresses.json")
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"))

  console.log("=== Debug AaveV3Adapter Integration ===\n")
  console.log("Vault:", addresses.vault)
  console.log("Adapter:", addresses.adapter)
  console.log("aWETH:", addresses.aWETH)

  const vault = await ethers.getContractAt("DeFiPilotVault", addresses.vault)
  const adapter = await ethers.getContractAt("AaveV3Adapter", addresses.adapter)

  // 1. Check vault paused
  try {
    const paused = await vault.paused()
    console.log("\n1. Vault paused:", paused)
  } catch (e: any) {
    console.log("\n1. Vault paused() FAILED:", e.message)
  }

  // 2. Check whitelist
  try {
    const isWhitelisted = await vault.whitelistedProtocols(addresses.adapter)
    console.log("2. Adapter whitelisted:", isWhitelisted)
  } catch (e: any) {
    console.log("2. whitelistedProtocols() FAILED:", e.message)
  }

  // 3. Check adapter.vault
  try {
    const adapterVault = await adapter.vault()
    console.log("3. Adapter vault:", adapterVault)
    console.log("   Matches vault?", adapterVault.toLowerCase() === addresses.vault.toLowerCase())
  } catch (e: any) {
    console.log("3. adapter.vault() FAILED:", e.message)
  }

  // 4. Check adapter.aWETH
  try {
    const aWETH = await adapter.aWETH()
    console.log("4. Adapter aWETH:", aWETH)
  } catch (e: any) {
    console.log("4. adapter.aWETH() FAILED:", e.message)
  }

  // 5. Check adapter.gateway
  try {
    const gw = await adapter.gateway()
    console.log("5. Adapter gateway:", gw)
  } catch (e: any) {
    console.log("5. adapter.gateway() FAILED:", e.message)
  }

  // 6. Check adapter.pool
  try {
    const pool = await adapter.pool()
    console.log("6. Adapter pool:", pool)
  } catch (e: any) {
    console.log("6. adapter.pool() FAILED:", e.message)
  }

  // 7. Check vault owner
  try {
    const owner = await vault.owner()
    console.log("7. Vault owner:", owner)
  } catch (e: any) {
    console.log("7. vault.owner() FAILED:", e.message)
  }

  // 8. Try deposit simulation (simpler function, also has nonReentrant + whenNotPaused)
  const [signer] = await ethers.getSigners()
  console.log("\n8. Signer:", signer.address)
  try {
    await vault.deposit.staticCall({ value: ethers.parseEther("0.001") })
    console.log("   deposit() simulation: SUCCESS")
  } catch (e: any) {
    console.log("   deposit() simulation FAILED:", e.reason || e.message)
    if (e.data) console.log("   revert data:", e.data)
  }

  // 9. Try depositAndExecute simulation
  console.log("\n9. Simulating depositAndExecute...")
  try {
    await vault.depositAndExecute.staticCall(addresses.adapter, {
      value: ethers.parseEther("0.001"),
    })
    console.log("   depositAndExecute simulation: SUCCESS")
  } catch (e: any) {
    console.log("   depositAndExecute simulation FAILED:")
    console.log("   Reason:", e.reason || e.message)
    if (e.data) console.log("   Revert data:", e.data)
    if (e.info?.error?.data) console.log("   Error data:", e.info.error.data)
  }

  // 10. Check implementation address
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  const implRaw = await ethers.provider.getStorage(addresses.vault, implSlot)
  console.log("\n10. Proxy implementation slot:", implRaw)
  const implAddr = "0x" + implRaw.slice(26)
  console.log("    Implementation address:", implAddr)

  // 11. Check proxy admin slot
  const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
  const adminRaw = await ethers.provider.getStorage(addresses.vault, adminSlot)
  console.log("11. Proxy admin slot:", adminRaw)

  // 12. Read raw paused storage directly
  const pausedSlot = "0xcd5ed15c6e187e77e9aee88184c21f4f2182ab5827cb3b7e07fbedcd63f03300"
  const pausedRaw = await ethers.provider.getStorage(addresses.vault, pausedSlot)
  console.log("12. Raw paused storage:", pausedRaw)

  // 13. Test each sub-step of depositAndExecute separately
  console.log("\n=== Step-by-step sub-calls ===")

  // 13a. adapter.aWETH() from vault context
  try {
    const aWeth = await adapter.aWETH()
    console.log("13a. adapter.aWETH() from script:", aWeth)
  } catch (e: any) {
    console.log("13a. adapter.aWETH() FAILED:", e.message)
  }

  // 13b. aWETH.balanceOf(vault)
  const aWethContract = await ethers.getContractAt("IERC20", addresses.aWETH)
  try {
    const bal = await aWethContract.balanceOf(addresses.vault)
    console.log("13b. aWETH.balanceOf(vault):", bal.toString())
  } catch (e: any) {
    console.log("13b. aWETH.balanceOf(vault) FAILED:", e.message)
  }

  // 13c. Send a real transaction for depositAndExecute (small amount)
  console.log("\n=== Sending REAL depositAndExecute tx ===")
  try {
    const tx = await vault.depositAndExecute(addresses.adapter, {
      value: ethers.parseEther("0.001"),
      gasLimit: 500_000,
    })
    console.log("13c. tx hash:", tx.hash)
    const receipt = await tx.wait()
    console.log("13c. tx status:", receipt!.status)
    console.log("13c. gas used:", receipt!.gasUsed.toString())
  } catch (e: any) {
    console.log("13c. depositAndExecute tx FAILED:")
    console.log("     reason:", e.reason || "no reason")
    console.log("     code:", e.code)
    if (e.receipt) {
      console.log("     gas used:", e.receipt.gasUsed.toString())
      console.log("     status:", e.receipt.status)
    }
    if (e.data) console.log("     data:", e.data)
    // Try to decode
    const shortMsg = e.shortMessage || e.message
    console.log("     shortMessage:", shortMsg?.substring(0, 300))
  }
}

main().catch(console.error)
