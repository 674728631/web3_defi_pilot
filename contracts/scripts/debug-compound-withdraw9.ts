import { ethers } from "hardhat"

async function main() {
  await ethers.provider.send("hardhat_reset", [{
    forking: {
      jsonRpcUrl: "https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9",
      blockNumber: 10552960
    }
  }])

  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const adapterAddr = "0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76"
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"

  await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr])
  await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"])
  const vault = await ethers.getSigner(vaultAddr)

  const comet = await ethers.getContractAt("IERC20", cometAddr, vault)
  const balance = await comet.balanceOf(vaultAddr)

  // 1. Transfer to adapter
  await comet.transfer(adapterAddr, balance)

  // 2. Try raw eth_call
  const adapter = await ethers.getContractAt("CompoundV3Adapter", adapterAddr, vault)
  const data = adapter.interface.encodeFunctionData("withdrawETH", [balance, vaultAddr])

  console.log("Calling withdrawETH with data:", data)
  try {
    await vault.sendTransaction({
      to: adapterAddr,
      data: data,
      gasLimit: 500000
    })
    console.log("Success!")
  } catch (e: any) {
    console.log("Failed:", e.message)
  }
}
main()
