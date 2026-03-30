import { ethers } from "hardhat"

async function main() {
  const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9');
  
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const adapterAddr = "0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76"
  
  // We simulate adapter.withdrawETH(1 wei) from vault
  const adapter = await ethers.getContractAt("CompoundV3Adapter", adapterAddr)
  const data = adapter.interface.encodeFunctionData("withdrawETH", [1, vaultAddr])

  try {
    await p.call({
      from: vaultAddr,
      to: adapterAddr,
      data: data
    })
    console.log("withdrawETH static call OK")
  } catch (e: any) {
    console.log("withdrawETH revert:", e.message)
    console.log("data:", e.data)
  }
}
main()
