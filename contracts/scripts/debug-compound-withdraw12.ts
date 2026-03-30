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
  const pos = await vault.getUserPosition(userAddr, 1)
  console.log("Position 1 at block 10552960:")
  console.log("Protocol:", pos.protocol)
  console.log("ReceivedToken:", pos.receivedToken)
  console.log("Active:", pos.active)
}
main()
