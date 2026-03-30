import { ethers, upgrades } from "hardhat"
import fs from "fs"
import path from "path"

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying CompoundV3Adapter with account:", deployer.address)

  // Compound V3 WETH Market on Sepolia
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"
  // WETH used by Comet on Sepolia
  const wethAddr = "0x2D5ee574e710219a521449679A4A7f2B43f046ad"

  const addressesPath = path.join(__dirname, "../../frontend/src/utils/deployed-addresses.json")
  let existing: any = {}
  if (fs.existsSync(addressesPath)) {
    existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"))
  }
  
  const vaultAddr = existing.vault
  if (!vaultAddr) {
    throw new Error("DeFiPilotVault not found in deployed-addresses.json")
  }

  const Adapter = await ethers.getContractFactory("CompoundV3Adapter")
  const adapter = await upgrades.deployProxy(Adapter, [cometAddr, wethAddr], { kind: "uups" })
  await adapter.waitForDeployment()
  const adapterAddr = await adapter.getAddress()

  console.log(`CompoundV3Adapter deployed to: ${adapterAddr}`)

  // Set vault
  const tx1 = await adapter.setVault(vaultAddr)
  await tx1.wait()
  console.log("Vault set on CompoundV3Adapter")

  // Whitelist in vault
  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr)
  const tx2 = await vault.whitelistProtocol(adapterAddr, true)
  await tx2.wait()
  console.log("CompoundV3Adapter whitelisted on Vault")

  // Update frontend addresses
  existing.compoundAdapter = adapterAddr
  fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2))
  
  // Update backend .env
  const backendEnvPath = path.join(__dirname, "../../backend/.env")
  if (fs.existsSync(backendEnvPath)) {
    let envContent = fs.readFileSync(backendEnvPath, "utf-8")
    if (envContent.includes("COMPOUND_ADAPTER_ADDRESS_SEPOLIA")) {
      envContent = envContent.replace(
        /COMPOUND_ADAPTER_ADDRESS_SEPOLIA=.*/,
        `COMPOUND_ADAPTER_ADDRESS_SEPOLIA=${adapterAddr}`
      )
    } else {
      envContent += `\nCOMPOUND_ADAPTER_ADDRESS_SEPOLIA=${adapterAddr}\n`
    }
    fs.writeFileSync(backendEnvPath, envContent)
  }

  console.log("Updated deployed-addresses.json and backend/.env")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
