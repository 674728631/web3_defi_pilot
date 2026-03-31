import { ethers, upgrades } from "hardhat"
import fs from "fs"
import path from "path"

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying with account:", deployer.address)

  const addressesPath = path.join(__dirname, "../../frontend/src/utils/deployed-addresses.json")
  let existing: any = {}
  if (fs.existsSync(addressesPath)) {
    existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"))
  }

  const vaultAddr = existing.vault
  if (!vaultAddr) throw new Error("DeFiPilotVault not found in deployed-addresses.json")

  // ─── 1. Deploy MockStETH ───
  console.log("\n=== Deploying MockStETH ===")
  const MockStETH = await ethers.getContractFactory("MockStETH")
  const stETH = await MockStETH.deploy()
  await stETH.waitForDeployment()
  const stETHAddr = await stETH.getAddress()
  console.log("MockStETH deployed to:", stETHAddr)

  // ─── 2. Deploy LidoAdapter (UUPS Proxy) ───
  console.log("\n=== Deploying LidoAdapter ===")
  const LidoAdapter = await ethers.getContractFactory("LidoAdapter")
  const lidoAdapter = await upgrades.deployProxy(LidoAdapter, [stETHAddr], { kind: "uups" })
  await lidoAdapter.waitForDeployment()
  const lidoAdapterAddr = await lidoAdapter.getAddress()
  console.log("LidoAdapter deployed to:", lidoAdapterAddr)

  await (await lidoAdapter.setVault(vaultAddr)).wait()
  console.log("Vault set on LidoAdapter")

  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr)
  await (await vault.whitelistProtocol(lidoAdapterAddr, true)).wait()
  console.log("LidoAdapter whitelisted on Vault")

  // ─── 3. Deploy UniswapV3Adapter (UUPS Proxy) ───
  console.log("\n=== Deploying UniswapV3Adapter ===")
  const positionManagerAddr = "0x1238536071E1c677A632429e3655c799b22cDA52" // Uni V3 NonfungiblePositionManager on Sepolia
  const wethAddr = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" // WETH on Sepolia
  const usdcAddr = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" // USDC on Sepolia
  const poolFee = 3000 // 0.3%

  const UniV3Adapter = await ethers.getContractFactory("UniswapV3Adapter")
  const uniAdapter = await upgrades.deployProxy(
    UniV3Adapter,
    [positionManagerAddr, wethAddr, usdcAddr, poolFee],
    { kind: "uups" }
  )
  await uniAdapter.waitForDeployment()
  const uniAdapterAddr = await uniAdapter.getAddress()
  console.log("UniswapV3Adapter deployed to:", uniAdapterAddr)

  const receiptTokenAddr = await uniAdapter.aWETH()
  console.log("UniV3ReceiptToken at:", receiptTokenAddr)

  await (await uniAdapter.setVault(vaultAddr)).wait()
  console.log("Vault set on UniswapV3Adapter")

  await (await vault.whitelistProtocol(uniAdapterAddr, true)).wait()
  console.log("UniswapV3Adapter whitelisted on Vault")

  // ─── 4. Update config files ───
  existing.mockStETH = stETHAddr
  existing.lidoAdapter = lidoAdapterAddr
  existing.uniswapV3Adapter = uniAdapterAddr
  existing.uniV3ReceiptToken = receiptTokenAddr
  fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2))

  const backendEnvPath = path.join(__dirname, "../../backend/.env")
  if (fs.existsSync(backendEnvPath)) {
    let envContent = fs.readFileSync(backendEnvPath, "utf-8")
    const additions = [
      `LIDO_ADAPTER_ADDRESS_SEPOLIA=${lidoAdapterAddr}`,
      `MOCK_STETH_ADDRESS_SEPOLIA=${stETHAddr}`,
      `UNISWAP_V3_ADAPTER_ADDRESS_SEPOLIA=${uniAdapterAddr}`,
      `UNIV3_RECEIPT_TOKEN_SEPOLIA=${receiptTokenAddr}`,
    ]
    for (const line of additions) {
      const key = line.split("=")[0]
      if (envContent.includes(key)) {
        envContent = envContent.replace(new RegExp(`${key}=.*`), line)
      } else {
        envContent += `\n${line}`
      }
    }
    fs.writeFileSync(backendEnvPath, envContent)
  }

  console.log("\n=== All done! ===")
  console.log(`MockStETH:          ${stETHAddr}`)
  console.log(`LidoAdapter:        ${lidoAdapterAddr}`)
  console.log(`UniswapV3Adapter:   ${uniAdapterAddr}`)
  console.log(`UniV3ReceiptToken:  ${receiptTokenAddr}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
