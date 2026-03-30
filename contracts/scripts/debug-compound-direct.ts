import { ethers } from "hardhat"

async function main() {
  const cometAddr = "0x2943ac1216979aD8dB76D9147F64E61adc126e96"
  const wethAddr = "0x2D5ee574e710219a521449679A4A7f2B43f046ad"

  const [signer] = await ethers.getSigners()

  const weth = await ethers.getContractAt("IWETH", wethAddr)
  const comet = await ethers.getContractAt("IComet", cometAddr)

  console.log("Depositing ETH to WETH...")
  await weth.deposit({ value: ethers.parseEther("0.01") })

  console.log("Approving WETH to Comet...")
  await weth.approve(cometAddr, ethers.parseEther("0.01"))

  console.log("Supplying WETH to Comet...")
  await comet.supply(wethAddr, ethers.parseEther("0.01"))

  const bal = await comet.balanceOf(signer.address)
  console.log("Comet balance:", bal.toString())

  console.log("Withdrawing WETH from Comet...")
  try {
    await comet.withdraw(wethAddr, bal)
    console.log("Withdraw succeeded!")
  } catch (e: any) {
    console.log("Withdraw failed:", e.message.slice(0, 200))
  }
}
main().catch(console.error)
