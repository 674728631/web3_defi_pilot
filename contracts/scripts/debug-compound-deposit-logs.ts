import { ethers } from "hardhat"

async function main() {
  const txHash = "0x73d500d676ba2b3dd07403d4028bdd3aed80fd67abc73ad22725bb23abe9f717"
  const tx = await ethers.provider.getTransactionReceipt(txHash)
  if (!tx) {
    console.log("Tx not found")
    return
  }

  console.log("Logs:")
  for (const log of tx.logs) {
    console.log(`Address: ${log.address}`)
    console.log(`Topics: ${log.topics.join(", ")}`)
    console.log(`Data: ${log.data}\n`)
  }
}
main().catch(console.error)
