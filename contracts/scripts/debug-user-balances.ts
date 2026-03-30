const { ethers } = require("ethers")

async function main() {
  const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/ZcQ5LqZBiwEi0ydLIqlm9');
  const vaultAddr = "0x55CAB33e07D3c99A008D18f96B04641E20D67550"
  const userAddr = "0x71C063bf0235591235029d1C90bEFA69df2CC612"

  const vault = new ethers.Contract(vaultAddr, [
    "function getUserInfo(address user) external view returns (uint256 ethBalance, uint256 positionCount)",
    "function getUserPosition(address user, uint256 positionId) external view returns (address protocol, address asset, uint256 amount, address receivedToken, uint256 receivedAmount, uint256 timestamp, bool active)"
  ], p)

  try {
    const info = await vault.getUserInfo(userAddr)
    console.log("Vault ETH Balance:", ethers.formatEther(info.ethBalance))
    console.log("Position Count:", info.positionCount.toString())

    for(let i=0; i<Number(info.positionCount); i++) {
        try {
            const pos = await vault.getUserPosition(userAddr, i)
            console.log(`Pos ${i}: protocol=${pos.protocol} active=${pos.active} amount=${ethers.formatEther(pos.amount)}`)
        } catch(e) {}
    }
  } catch (e: any) {
    console.log("Failed to get info:", e.message)
  }
}
main()
