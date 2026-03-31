# DeFi Pilot 部署指南

本文档涵盖智能合约、后端服务和前端应用的完整部署流程。

---

## 目录

1. [前置条件](#前置条件)
2. [智能合约部署](#智能合约部署)
3. [后端部署](#后端部署)
4. [前端部署](#前端部署)
5. [合约升级](#合约升级)
6. [部署后验证](#部署后验证)
7. [常见问题](#常见问题)

---

## 前置条件

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 18+ | 合约编译/测试和前端构建 |
| Go | 1.25+ | 后端服务 |
| Git | 2.x | 代码管理 |

### 获取代码

```bash
git clone <repo-url>
cd web3-hackathon
```

### 准备钱包

1. 创建一个专用的部署钱包（不要使用日常钱包）
2. 导出私钥（不含 `0x` 前缀）
3. 确保钱包有足够的测试网 ETH：
   - Sepolia: 通过 [Sepolia Faucet](https://sepoliafaucet.com/) 获取
   - Arbitrum Sepolia: 通过 [Arbitrum Faucet](https://faucet.arbitrum.io/) 获取

---

## 智能合约部署

### 1. 安装依赖

```bash
cd contracts
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 部署钱包私钥（不含 0x 前缀）
PRIVATE_KEY=abcdef1234567890...

# RPC 端点（可使用 Alchemy/Infura 获取更稳定的节点）
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ARB_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY

# Etherscan 验证（可选，但推荐）
ETHERSCAN_API_KEY=your_etherscan_key
ARBISCAN_API_KEY=your_arbiscan_key
```

### 3. 编译合约

```bash
npx hardhat compile
```

确认无编译错误。Transient storage 警告可忽略（EIP-1153 重入锁的正常行为）。

### 4. 运行测试

```bash
npx hardhat test
```

确认 31/31 全部通过后再部署。

### 5. 部署到 Sepolia

如果需要 Aave 集成，需要提供 Aave V3 Sepolia 地址：

```env
# Aave V3 Sepolia 地址（可选，如果不配置则跳过 Adapter 部署）
AAVE_GATEWAY_ADDRESS=0xBb04B3406957C363af2bD8E90E1Ac15c4D30f281
AAVE_POOL_ADDRESS=0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951
AAVE_AWETH_ADDRESS=0x5b071b590a59395fE4025AC02f7F082e0f14f01C
```

执行部署：

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

成功后输出类似：

```
Deploying DeFi Pilot contracts (UUPS Proxy) to chain 11155111...
DeFiPilotVault proxy deployed to: 0x55CAB33e...
IntentExecutor proxy deployed to: 0x7a24b1B7...
AaveV3Adapter proxy deployed to: 0x1234abcd...
✅ Deployment complete!
```

部署脚本会自动：
- 将部署地址写入 `contracts/deployed-addresses.json`
- 同步到 `frontend/src/utils/deployed-addresses.json`
- 设置 IntentExecutor 为 Vault 的执行器
- 将部署者设为 Solver
- 将 Adapter 加入 Vault 白名单

### 6. 部署到 Arbitrum Sepolia

```bash
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

### 7. 验证合约（可选但推荐）

```bash
npx hardhat verify --network sepolia <VAULT_IMPLEMENTATION_ADDRESS>
npx hardhat verify --network sepolia <EXECUTOR_IMPLEMENTATION_ADDRESS> <VAULT_PROXY_ADDRESS>
```

> 注意：需要验证的是**实现合约地址**，而非代理地址。可在 `contracts/.openzeppelin/` 的 JSON 文件中找到实现地址。

---

## 后端部署

### 1. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，将合约部署的地址填入：

```env
# OpenAI（必须有 API Key 才能启用 AI 策略，否则使用本地回退引擎）
OPENAI_API_KEY=sk-xxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Solver 私钥（与部署钱包相同即可，用于代提交交易）
SOLVER_PRIVATE_KEY=abcdef1234567890...

# RPC（与合约部署使用相同的节点）
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ARB_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY

# 合约地址（从 deployed-addresses.json 复制）
VAULT_ADDRESS_SEPOLIA=0x55CAB33e07D3c99A008D18f96B04641E20D67550
EXECUTOR_ADDRESS_SEPOLIA=0x7a24b1B70FB60c013513E475CC0107114c6eAbeB
ADAPTER_ADDRESS_SEPOLIA=0x1234abcd...
VAULT_ADDRESS_ARB=0x0000000000000000000000000000000000000000
EXECUTOR_ADDRESS_ARB=0x0000000000000000000000000000000000000000
ADAPTER_ADDRESS_ARB=0x0000000000000000000000000000000000000000

# 服务配置
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
```

### 2. 启动后端

```bash
go run main.go
```

验证服务启动：

```bash
curl http://localhost:3001/health
# 应返回: {"status":"ok"}
```

### 3. 生产部署

推荐使用 Docker 或 systemd：

```bash
# 编译
go build -o defi-pilot-backend main.go

# 运行（生产模式）
GIN_MODE=release ./defi-pilot-backend
```

**安全注意事项：**
- 生产环境**必须**配置 HTTPS（通过 Nginx/Caddy 反代）
- `FRONTEND_ORIGIN` 设为实际前端域名
- `SOLVER_PRIVATE_KEY` 的钱包中不要存放大额资金
- 考虑添加 API 认证中间件保护 `/api/execute` 端点

---

## 前端部署

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

```env
# 后端 API 地址
VITE_BACKEND_URL=http://localhost:3001

# WalletConnect 项目 ID（可选，在 https://cloud.walletconnect.com 免费获取）
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

### 3. 确认合约地址

确保 `frontend/src/utils/deployed-addresses.json` 存在且包含正确的地址（合约部署脚本会自动生成）。如果手动部署，需手动创建：

```json
{
  "chainId": 11155111,
  "vault": "0x55CAB33e...",
  "executor": "0x7a24b1B7...",
  "adapter": "0x1234abcd...",
  "aWETH": "0x5b071b59...",
  "deployer": "0x...",
  "deployedAt": "2024-01-01T00:00:00.000Z"
}
```

### 4. 本地开发

```bash
npm run dev
# 启动在 http://localhost:5173
```

### 5. 生产构建

```bash
npm run build
# 产物在 dist/ 目录
```

部署 `dist/` 到任意静态托管服务（Vercel、Netlify、Cloudflare Pages 等）。

**Vercel 一键部署示例：**

```bash
npx vercel --prod
```

---

## 合约升级

合约使用 UUPS 代理模式，支持不改变代理地址的情况下升级实现逻辑。

### 升级步骤

1. 修改合约代码（确保存储布局兼容）
2. 编译并运行测试

```bash
npx hardhat compile
npx hardhat test
```

3. 执行升级

```bash
# 升级 Vault
UPGRADE_TARGET=vault npx hardhat run scripts/upgrade.ts --network sepolia

# 升级 Executor
UPGRADE_TARGET=executor npx hardhat run scripts/upgrade.ts --network sepolia

# 升级 Adapter
UPGRADE_TARGET=adapter npx hardhat run scripts/upgrade.ts --network sepolia
```

### 升级注意事项

- 只有合约 `owner` 可以发起升级
- 新版本**不能**修改已有状态变量的顺序或类型
- 新增状态变量只能追加在末尾
- 升级前建议在本地 fork 测试网验证
- 合约已内置 `pause()`/`unpause()` 紧急暂停功能，升级前可先暂停

---

## 部署后验证

### 1. 检查合约健康度

```bash
curl "http://localhost:3001/api/health/vault?chainId=11155111"
```

应返回 `healthy: true`。

### 2. 检查余额查询

```bash
curl "http://localhost:3001/api/vault/balance?address=YOUR_ADDRESS&chainId=11155111"
```

### 3. 前端验证

1. 打开前端页面
2. 连接 MetaMask（切换到 Sepolia 测试网）
3. 在 Chat 中输入："帮我用 1 ETH 找最优策略"
4. 确认 AI 返回策略卡片
5. 点击执行，确认 MetaMask 弹窗
6. 等待交易确认，检查仪表盘数据更新

### 4. 合约直接交互验证

```bash
# 查看 Vault Owner
npx hardhat console --network sepolia
> const vault = await ethers.getContractAt("DeFiPilotVault", "0x55CAB33e...")
> await vault.owner()

# 查看白名单状态
> await vault.whitelistedProtocols("0x1234abcd...")

# 查看健康度
> await vault.getHealthFactor()
```

---

## 常见问题

### Q: 部署时报 "insufficient funds"
A: 确保部署钱包有足够的测试网 ETH。Sepolia 建议至少 0.5 ETH。

### Q: 后端启动报 "invalid solver private key"
A: 检查 `.env` 中 `SOLVER_PRIVATE_KEY` 是否正确，不要包含 `0x` 前缀。

### Q: 前端显示 "后端未连接" 降级提示
A: 确认后端服务正在运行，且 `VITE_BACKEND_URL` 地址正确。检查 CORS 配置中的 `FRONTEND_ORIGIN`。

### Q: 合约调用返回 "Not authorized"
A: 确认 IntentExecutor 已设置为 Vault 的 executor（`setIntentExecutor`），且 Solver 地址已通过 `setSolver` 添加。

### Q: Aave 存款失败
A: 确认 AaveV3Adapter 已：
1. 通过 `vault.whitelistProtocol(adapter, true)` 加入白名单
2. 通过 `adapter.setVault(vault)` 设置 Vault 地址
3. Aave Gateway/Pool/aWETH 地址正确

### Q: 如何部署额外的协议 Adapter？

DeFi Pilot 的适配器架构支持热插拔。部署新协议**无需修改 Vault 合约或前端代码**。

**步骤：**

1. 编写实现统一接口的 Adapter 合约（需包含 `aWETH()`、`depositETH(address)`、`withdrawETH(uint256,address)` 方法）
2. 部署到链上
3. 调用 `adapter.setVault(vaultAddress)` 设置 Vault
4. 调用 `vault.whitelistProtocol(adapterAddress, true)` 加入白名单
5. 在后端 `services/registry.go` 的 Registry 中添加条目

**已部署的 Adapter 参考命令：**

```bash
# 部署 Lido Mock + Uniswap V3 适配器
npx hardhat run scripts/deploy-lido-uniswap.ts --network sepolia

# 部署 Compound V3 适配器
npx hardhat run scripts/deploy-compound-adapter.ts --network sepolia

# 升级 Compound V3 适配器（修复后）
npx hardhat run scripts/upgrade-compound.ts --network sepolia
```

### Q: 如何紧急暂停合约？
A: 以 owner 身份调用：

```bash
npx hardhat console --network sepolia
> const vault = await ethers.getContractAt("DeFiPilotVault", "VAULT_ADDRESS")
> await vault.pause()
> // 恢复: await vault.unpause()
```
