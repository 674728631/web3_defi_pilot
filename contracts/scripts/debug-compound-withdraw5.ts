import { ethers } from "hardhat"

async function main() {
  const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9');
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const adapterAddr = "0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76"
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"

  // We will simulate what happens inside the vault's withdrawFromProtocol
  // Vault has Comet balance: ~1 ETH. Let's see what happens if we impersonate vault and do transfer then withdraw.
  
  await ethers.provider.send("hardhat_reset", [{
    forking: {
      jsonRpcUrl: "https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9",
      blockNumber: 10552960
    }
  }])

  await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr])
  await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"])
  const vault = await ethers.getSigner(vaultAddr)

  const comet = await ethers.getContractAt("IERC20", cometAddr, vault)
  const balance = await comet.balanceOf(vaultAddr)
  console.log("Vault comet balance:", balance.toString())

  try {
    await comet.transfer(adapterAddr, balance)
    console.log("Comet transfer OK")
  } catch (e: any) {
    console.log("Comet transfer failed:", e.message.slice(0, 200))
    return
  }

  const adapter = await ethers.getContractAt("CompoundV3Adapter", adapterAddr, vault)
  try {
    const tx = await adapter.withdrawETH(balance, vaultAddr)
    await tx.wait()
    console.log("withdrawETH OK")
  } catch (e: any) {
    console.log("withdrawETH failed:")
    console.log(e.message)
    console.log(e.data)
  }
}
main()
