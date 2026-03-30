import { ethers } from "hardhat"

async function main() {
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  await ethers.provider.send("hardhat_impersonateAccount", [userAddr])
  const user = await ethers.getSigner(userAddr)
  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr, user)

  console.log("=== Debug Compound Withdraw ===")
  const txHash = "0x810a156084f5c56345aef680cb8d26c6a539db075ff8cc0ba1eab87a6c8f3fa2"
  const tx = await ethers.provider.getTransaction(txHash)
  
  if (!tx) {
    console.log("Tx not found")
    return
  }

  try {
    const result = await ethers.provider.call({
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value
    }, tx.blockNumber - 1)
    console.log("Simulation succeeded:", result)
  } catch (e: any) {
    console.log("Simulation reverted:")
    console.log(e.message)
    console.log(e.data)
  }
}

main().catch(console.error)
