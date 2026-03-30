import { ethers } from "hardhat"

async function main() {
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"
  const wethAddr = "0x2D5ee574e710219a521449679A4A7f2B43f046ad"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  await ethers.provider.send("hardhat_impersonateAccount", [userAddr])
  await ethers.provider.send("hardhat_setBalance", [userAddr, "0x56BC75E2D63100000"])
  const signer = await ethers.getSigner(userAddr)

  const weth = await ethers.getContractAt("IWETH", wethAddr, signer)
  const comet = await ethers.getContractAt("IComet", cometAddr, signer)

  console.log("Depositing ETH to WETH...")
  await (await weth.deposit({ value: ethers.parseEther("0.01") })).wait()

  console.log("Approving WETH to Comet...")
  await (await weth.approve(cometAddr, ethers.parseEther("0.01"))).wait()

  console.log("Supplying WETH to Comet...")
  await (await comet.supply(wethAddr, ethers.parseEther("0.01"))).wait()

  const bal = await comet.balanceOf(signer.address)
  console.log("Comet balance:", bal.toString())

  console.log("Withdrawing WETH from Comet...")
  try {
    await (await comet.withdraw(wethAddr, bal)).wait()
    console.log("Withdraw succeeded!")
  } catch (e: any) {
    console.log("Withdraw failed:", e.message.slice(0, 200))
  }
}
main().catch(console.error)
