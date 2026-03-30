import { ethers, upgrades } from "hardhat"

async function main() {
  const proxyAddress = "0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76"
  const Adapter = await ethers.getContractFactory("CompoundV3Adapter")
  
  console.log("Upgrading CompoundV3Adapter...")
  await upgrades.upgradeProxy(proxyAddress, Adapter)
  console.log("CompoundV3Adapter upgraded!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
