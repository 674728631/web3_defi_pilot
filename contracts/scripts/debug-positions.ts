import { ethers } from "hardhat"

async function main() {
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr)

  const count = await vault.getUserPositionCount(userAddr)
  console.log("Position count:", count.toString())

  for (let i = 0; i < Number(count); i++) {
    const pos = await vault.getUserPosition(userAddr, i)
    console.log(`Position ${i}:`, {
      protocol: pos.protocol,
      amount: ethers.formatEther(pos.amount),
      active: pos.active
    })
  }
}

main().catch(console.error)
