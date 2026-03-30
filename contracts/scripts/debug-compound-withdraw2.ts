import { ethers } from "hardhat"

async function main() {
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  await ethers.provider.send("hardhat_impersonateAccount", [userAddr])
  const user = await ethers.getSigner(userAddr)
  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr, user)

  const pos1 = await vault.getUserPosition(userAddr, 1)
  console.log("Position 1 active:", pos1.active)

  try {
    await vault.withdrawFromProtocol.staticCall(1)
    console.log("Withdraw staticCall succeeded")
  } catch (e: any) {
    console.log("Withdraw staticCall failed:", e.message.slice(0, 300))
  }
}
main().catch(console.error)
