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

  const vault = await ethers.getContractAt("DeFiPilotVault", vaultAddr)
  const data = vault.interface.encodeFunctionData("withdrawFromProtocol", [1])

  console.log("Tracing eth_call...")
  try {
    const trace = await ethers.provider.send("debug_traceCall", [
      {
        from: userAddr,
        to: vaultAddr,
        data: data,
        gas: "0x7a120" // 500,000 gas
      },
      "latest",
      { tracer: "callTracer" }
    ])
    
    console.log(JSON.stringify(trace, null, 2))
  } catch (e: any) {
    console.log("Failed trace:", e.message)
  }
}
main()
