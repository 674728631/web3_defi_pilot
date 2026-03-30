import { ethers } from "hardhat"

async function main() {
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"
  const adapterAddr = "0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76"
  const wethAddr = "0x2D5ee574e710219a521449679A4A7f2B43f046ad"

  const comet = await ethers.getContractAt("IERC20", cometAddr)
  const balance = await comet.balanceOf(vaultAddr)
  console.log("Vault Comet balance:", ethers.formatEther(balance))

  // Test adapter withdraw
  await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr])
  await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"])
  const vaultSigner = await ethers.getSigner(vaultAddr)
  
  // Vault needs to transfer comet tokens to adapter before calling withdrawETH
  console.log("Transferring Comet to Adapter...")
  try {
    const cometAsVault = await ethers.getContractAt("IERC20", cometAddr, vaultSigner)
    await cometAsVault.transfer(adapterAddr, balance)
    console.log("Transfer successful!")
  } catch (e: any) {
    console.log("Transfer failed:", e.message.slice(0, 300))
  }

  console.log("Calling adapter.withdrawETH...")
  try {
    const adapterAsVault = await ethers.getContractAt("CompoundV3Adapter", adapterAddr, vaultSigner)
    await adapterAsVault.withdrawETH(balance, vaultAddr)
    console.log("adapter.withdrawETH successful!")
  } catch (e: any) {
    console.log("adapter.withdrawETH failed:", e.message.slice(0, 300))
  }
}
main().catch(console.error)
