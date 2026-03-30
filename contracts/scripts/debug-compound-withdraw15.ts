import { ethers } from "hardhat"

async function main() {
  await ethers.provider.send("hardhat_reset", [{
    forking: {
      jsonRpcUrl: "https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9",
      blockNumber: 10552960
    }
  }])

  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"

  await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr])
  await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"])
  const vault = await ethers.getSigner(vaultAddr)

  const Mimic = await ethers.getContractFactory("VaultMimic", vault)
  const mimic = await Mimic.deploy()

  // Transfer Comet from Vault to Mimic so Mimic has tokens
  const comet = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", cometAddr, vault)
  const balance = await comet.balanceOf(vaultAddr)
  await comet.transfer(await mimic.getAddress(), balance)

  console.log("Calling mimic...")
  const res = await mimic.mimic.staticCall(balance)
  console.log("Result:", res)
}
main()
