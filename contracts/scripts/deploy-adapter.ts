import { ethers, upgrades, network } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const chainId = network.config.chainId ?? 31337
  console.log(`\nDeploying AaveV3Adapter (UUPS Proxy) to chain ${chainId}...\n`)

  const gatewayAddr = process.env.AAVE_GATEWAY_ADDRESS
  const poolAddr = process.env.AAVE_POOL_ADDRESS
  const aWethAddr = process.env.AAVE_AWETH_ADDRESS

  if (!gatewayAddr || !poolAddr || !aWethAddr) {
    throw new Error(
      "Missing AAVE_GATEWAY_ADDRESS, AAVE_POOL_ADDRESS, or AAVE_AWETH_ADDRESS in .env"
    )
  }

  const addressesPath = path.join(__dirname, "..", "deployed-addresses.json")
  if (!fs.existsSync(addressesPath)) {
    throw new Error(`deployed-addresses.json not found at ${addressesPath}`)
  }
  const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"))
  const vaultAddr = existing.vault
  if (!vaultAddr || vaultAddr === ethers.ZeroAddress) {
    throw new Error("Vault address not found in deployed-addresses.json")
  }
  console.log(`Existing Vault: ${vaultAddr}`)

  // 1. Deploy AaveV3Adapter as UUPS proxy
  const Adapter = await ethers.getContractFactory("AaveV3Adapter")
  const adapter = await upgrades.deployProxy(
    Adapter,
    [gatewayAddr, poolAddr, aWethAddr],
    { kind: "uups" }
  )
  await adapter.waitForDeployment()
  const adapterAddr = await adapter.getAddress()
  console.log(`AaveV3Adapter proxy deployed to: ${adapterAddr}`)

  // 2. Set vault on adapter
  await adapter.setVault(vaultAddr)
  console.log("Vault set on AaveV3Adapter")

  // 3. Whitelist adapter on vault
  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr)
  const tx = await vault.whitelistProtocol(adapterAddr, true)
  await tx.wait()
  console.log("AaveV3Adapter whitelisted on Vault")

  // 4. Update deployed-addresses.json
  existing.adapter = adapterAddr
  existing.aWETH = aWethAddr

  fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2))
  console.log(`\nAddresses updated: ${addressesPath}`)

  const frontendPath = path.join(
    __dirname, "..", "..", "frontend", "src", "utils", "deployed-addresses.json"
  )
  try {
    fs.writeFileSync(frontendPath, JSON.stringify(existing, null, 2))
    console.log(`Addresses updated: ${frontendPath}`)
  } catch {
    console.log("Frontend directory not found, skipping")
  }

  console.log("\n--- Deployment Summary ---")
  console.log(`Adapter (proxy): ${adapterAddr}`)
  console.log(`Gateway:         ${gatewayAddr}`)
  console.log(`Pool:            ${poolAddr}`)
  console.log(`aWETH:           ${aWethAddr}`)
  console.log(`Vault:           ${vaultAddr}`)
  console.log("Done!")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
