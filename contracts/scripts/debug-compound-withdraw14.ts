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
  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr, await ethers.getSigner(userAddr))

  console.log("Tracing withdrawFromProtocol(1)...")

  const tx = await vault.withdrawFromProtocol.populateTransaction(1)
  
  // Let's use debug_traceCall to see inner calls
  try {
    const trace = await ethers.provider.send("debug_traceCall", [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        gas: "0x7a120"
      },
      "latest",
      {
        tracer: "{data: [], fault: function(log) { this.data.push(log.op.toString()) }, step: function(log) { this.data.push(log.op.toString()) }, result: function() { return this.data; }}"
      }
    ])
    console.log("Trace OK, length:", trace.length)
  } catch (e: any) {
    console.log("Trace failed:", e.message.slice(0, 500))
  }
}
main()
