package contracts

// Vault ABI (subset used by backend)
const VaultABI = `[
  {"inputs":[{"name":"user","type":"address"}],"name":"getUserBalance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"getUserPositionCount","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"},{"name":"posId","type":"uint256"}],"name":"getUserPosition","outputs":[{"components":[{"name":"protocol","type":"address"},{"name":"asset","type":"address"},{"name":"amount","type":"uint256"},{"name":"receivedToken","type":"address"},{"name":"receivedAmount","type":"uint256"},{"name":"timestamp","type":"uint256"},{"name":"active","type":"bool"}],"name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getHealthFactor","outputs":[{"name":"actualBalance","type":"uint256"},{"name":"totalAccounted","type":"uint256"},{"name":"healthy","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"totalEthBalance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"protocol","type":"address"}],"name":"depositAndExecute","outputs":[],"stateMutability":"payable","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"user","type":"address"},{"name":"amount","type":"uint256"}],"name":"Deposited","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"user","type":"address"},{"name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"user","type":"address"},{"name":"protocol","type":"address"},{"name":"amount","type":"uint256"}],"name":"StrategyExecuted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"user","type":"address"},{"name":"positionId","type":"uint256"},{"name":"ethReceived","type":"uint256"}],"name":"PositionClosed","type":"event"}
]`

// IntentExecutor ABI (subset used by backend)
const ExecutorABI = `[
  {"inputs":[{"name":"user","type":"address"},{"components":[{"name":"protocol","type":"address"},{"name":"amount","type":"uint256"},{"name":"data","type":"bytes"}],"name":"intents","type":"tuple[]"}],"name":"executeBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"user","type":"address"},{"components":[{"name":"protocol","type":"address"},{"name":"amount","type":"uint256"},{"name":"data","type":"bytes"}],"name":"intents","type":"tuple[]"},{"name":"deadline","type":"uint256"},{"name":"signature","type":"bytes"}],"name":"executeBatchWithSig","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"","type":"address"}],"name":"nonces","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"user","type":"address"},{"name":"count","type":"uint256"}],"name":"IntentsBatchExecuted","type":"event"}
]`

// ERC20 balanceOf (for aToken queries)
const ERC20ABI = `[
  {"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]`

// AaveV3Adapter partial ABI
const AdapterABI = `[
  {"inputs":[{"name":"onBehalfOf","type":"address"}],"name":"depositETH","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[],"name":"aWETH","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}
]`
