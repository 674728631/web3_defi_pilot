const { ethers } = require("ethers")

async function main() {
  const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9');
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"

  const iface = new ethers.Interface(["function withdrawFromProtocol(uint256)"])
  const data = iface.encodeFunctionData("withdrawFromProtocol", [1])

  try {
    await p.call({
      from: userAddr,
      to: vaultAddr,
      data: data
    })
    console.log("static call succeeded!")
  } catch (e: any) {
    console.log("revert:", e.message)
    console.log("data:", e.data)
  }
}
main()
