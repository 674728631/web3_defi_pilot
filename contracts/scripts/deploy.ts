import { ethers, upgrades, network } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const chainId = network.config.chainId ?? 31337
  console.log(`Deploying DeFi Pilot contracts (UUPS Proxy) to chain ${chainId}...`)

  // ── 1. DeFiPilotVault (UUPS Proxy) ──
  const Vault = await ethers.getContractFactory("DeFiPilotVault")
  const vault = await upgrades.deployProxy(Vault, [], { kind: "uups" })
  await vault.waitForDeployment()
  const vaultAddr = await vault.getAddress()
  console.log(`DeFiPilotVault proxy deployed to: ${vaultAddr}`)

  // ── 2. IntentExecutor (UUPS Proxy) ──
  const Executor = await ethers.getContractFactory("IntentExecutor")
  const executor = await upgrades.deployProxy(Executor, [vaultAddr], { kind: "uups" })
  await executor.waitForDeployment()
  const executorAddr = await executor.getAddress()
  console.log(`IntentExecutor proxy deployed to: ${executorAddr}`)

  await vault.setIntentExecutor(executorAddr)
  console.log("IntentExecutor set on Vault")

  const [deployer] = await ethers.getSigners()
  await executor.setSolver(deployer.address, true)
  console.log(`Deployer ${deployer.address} set as solver`)

  // ── 3. AaveV3Adapter (UUPS Proxy) ──
  const gatewayAddr = process.env.AAVE_GATEWAY_ADDRESS || ethers.ZeroAddress
  const poolAddr = process.env.AAVE_POOL_ADDRESS || ethers.ZeroAddress
  const aWethAddr = process.env.AAVE_AWETH_ADDRESS || ethers.ZeroAddress

  let adapterAddr = ethers.ZeroAddress
  if (gatewayAddr !== ethers.ZeroAddress) {
    const Adapter = await ethers.getContractFactory("AaveV3Adapter")
    const adapter = await upgrades.deployProxy(
      Adapter,
      [gatewayAddr, poolAddr, aWethAddr],
      { kind: "uups" }
    )
    await adapter.waitForDeployment()
    adapterAddr = await adapter.getAddress()
    console.log(`AaveV3Adapter proxy deployed to: ${adapterAddr}`)

    await vault.whitelistProtocol(adapterAddr, true)
    console.log("AaveV3Adapter whitelisted on Vault")

    await adapter.setVault(vaultAddr)
    console.log("Vault set on AaveV3Adapter")
  } else {
    console.log("Skipping AaveV3Adapter (AAVE_GATEWAY_ADDRESS not set)")
  }

  // ── 4. 输出地址文件 ──
  const addresses = {
    chainId,
    vault: vaultAddr,
    executor: executorAddr,
    adapter: adapterAddr,
    aWETH: aWethAddr,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  }

  const contractsOutPath = path.join(__dirname, "..", "deployed-addresses.json")
  fs.writeFileSync(contractsOutPath, JSON.stringify(addresses, null, 2))
  console.log(`\nAddresses written to ${contractsOutPath}`)

  const frontendOutPath = path.join(__dirname, "..", "..", "frontend", "src", "utils", "deployed-addresses.json")
  try {
    fs.writeFileSync(frontendOutPath, JSON.stringify(addresses, null, 2))
    console.log(`Addresses written to ${frontendOutPath}`)
  } catch {
    console.log("Frontend directory not found, skipping frontend address output")
  }

  console.log("\n✅ Deployment complete!")
  console.log("---")
  console.log(`Vault (proxy):    ${vaultAddr}`)
  console.log(`Executor (proxy): ${executorAddr}`)
  console.log(`Adapter (proxy):  ${adapterAddr}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
