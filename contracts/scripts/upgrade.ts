import { ethers, upgrades } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const addressesPath = path.join(__dirname, "..", "deployed-addresses.json")
  if (!fs.existsSync(addressesPath)) {
    throw new Error("deployed-addresses.json not found. Deploy first.")
  }

  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"))
  const target = process.env.UPGRADE_TARGET

  if (!target) {
    console.log("Usage: UPGRADE_TARGET=vault|executor|adapter npx hardhat run scripts/upgrade.ts --network <network>")
    console.log("\nCurrent deployed addresses:")
    console.log(`  Vault:    ${addresses.vault}`)
    console.log(`  Executor: ${addresses.executor}`)
    console.log(`  Adapter:  ${addresses.adapter}`)
    return
  }

  const proxyAddress = addresses[target]
  if (!proxyAddress || proxyAddress === ethers.ZeroAddress) {
    throw new Error(`No deployed address found for target: ${target}`)
  }

  const contractMap: Record<string, string> = {
    vault: "DeFiPilotVault",
    executor: "IntentExecutor",
    adapter: "AaveV3Adapter",
  }

  const contractName = contractMap[target]
  if (!contractName) {
    throw new Error(`Unknown target: ${target}. Use vault, executor, or adapter.`)
  }

  console.log(`Upgrading ${contractName} at proxy ${proxyAddress}...`)

  const Factory = await ethers.getContractFactory(contractName)
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory)
  await upgraded.waitForDeployment()

  console.log(`✅ ${contractName} upgraded successfully!`)
  console.log(`   Proxy address (unchanged): ${proxyAddress}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
