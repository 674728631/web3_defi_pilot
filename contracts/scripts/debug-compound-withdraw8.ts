import { ethers } from "hardhat"

async function main() {
  await ethers.provider.send("hardhat_reset", [{
    forking: {
      jsonRpcUrl: "https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9",
      blockNumber: 10552960
    }
  }])

  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  await ethers.provider.send("hardhat_impersonateAccount", [userAddr])
  const user = await ethers.getSigner(userAddr)
  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr, user)

  console.log("Calling vault.withdrawFromProtocol(1)...")
  try {
    // To get detailed trace, we will send transaction
    const tx = await vault.withdrawFromProtocol(1, { gasLimit: 500000 })
    const receipt = await tx.wait()
    console.log("Success! Gas used:", receipt.gasUsed.toString())
  } catch (e: any) {
    console.log("Failed!")
    console.log("Revert reason:", e.message)
    // We can fetch the debug trace of the failed transaction from Hardhat!
    const hash = e.receipt?.hash || e.transactionHash
    if (hash) {
      console.log("Tx Hash:", hash)
      const trace = await ethers.provider.send("debug_traceTransaction", [hash, { disableMemory: true, disableStack: true, disableStorage: true }])
      
      // Let's find the revert inside the trace
      for (const step of trace.structLogs) {
        if (step.error) {
          console.log("Error at step:", step)
        }
      }
    }
  }
}
main()
