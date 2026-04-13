# DeFiPilot Subgraph

基于 [The Graph](https://thegraph.com/) 的链上事件索引服务，为 DeFiPilotVault 和 IntentExecutor 合约提供 GraphQL 查询接口。

## 目录结构

```
subgraph/
├── abis/                   # 合约 ABI（从 contracts/artifacts 复制）
│   ├── DeFiPilotVault.json
│   └── IntentExecutor.json
├── generated/              # graph codegen 自动生成的 TypeScript 类型
├── src/
│   ├── vault.ts            # Vault 事件处理器（Deposited, Withdrawn, StrategyExecuted 等）
│   └── executor.ts         # IntentExecutor 事件处理器（IntentsBatchExecuted）
├── schema.graphql          # GraphQL 数据模型定义
├── subgraph.yaml           # Subgraph 配置（合约地址、网络、事件映射）
└── package.json
```

## 前置条件

- Node.js >= 18
- npm 或 yarn
- 一个以太坊钱包（用于登录 Subgraph Studio）

## 安装

```bash
cd subgraph
npm install
```

## 部署到 Subgraph Studio（推荐）

### 1. 创建 Subgraph

1. 访问 [Subgraph Studio](https://thegraph.com/studio/)
2. 使用钱包（MetaMask）连接登录
3. 点击 **"Create a Subgraph"**
4. 填写信息：
   - Subgraph Name: `defi-pilot`（或自定义名称）
   - Network: **Ethereum Sepolia**
5. 创建后，在页面上找到你的 **Deploy Key**

### 2. 认证 CLI

```bash
npx graph auth --studio <你的Deploy Key>
```

成功后会提示 `Deploy key set`。

### 3. 修改配置（可选）

如果你的合约部署在不同地址或不同区块，编辑 `subgraph.yaml`：

```yaml
# 修改合约地址
source:
  address: "0x你的Vault地址"
  startBlock: 实际部署区块号   # 在 Sepolia Etherscan 查询
```

> **提示**：`startBlock` 越精确，初次同步越快。查询方法：在 [Sepolia Etherscan](https://sepolia.etherscan.io/) 搜索合约地址，找到 "Contract Creation" 交易的区块号。

### 4. 构建

```bash
npm run build
```

应看到 `Build completed` 输出。

### 5. 部署

```bash
npm run deploy
```

部署时会提示输入版本标签（如 `v0.0.1`）。部署成功后，回到 Subgraph Studio 页面可以看到同步进度。

### 6. 等待同步

- Studio 控制台显示同步进度百分比
- Sepolia 链通常 5~15 分钟完成同步
- 同步完成后状态变为 **"Synced"**

## 查询数据

### GraphQL Playground

Subgraph Studio 提供内置的 GraphQL Playground，可以直接在网页上测试查询。

### Query URL

同步完成后，Studio 页面会显示你的 Query URL：

```
https://api.studio.thegraph.com/query/<你的ID>/defi-pilot/version/latest
```

### 查询示例

**全局统计**

```graphql
{
  vaultStats(id: "global") {
    totalUsers
    totalDeposits
    totalWithdrawals
    totalPositionsCreated
    totalPositionsClosed
    totalEthRescued
  }
}
```

**Top 用户（按余额排序）**

```graphql
{
  users(first: 10, orderBy: ethBalance, orderDirection: desc) {
    id
    ethBalance
    totalDeposited
    totalWithdrawn
    positionCount
    activePositionCount
    firstSeenAt
    lastActivityAt
  }
}
```

**查询特定用户的所有活跃持仓**

```graphql
{
  user(id: "0x用户地址小写") {
    ethBalance
    positions(where: { active: true }) {
      positionId
      protocol
      amount
      createdAt
    }
  }
}
```

**最近的存款事件**

```graphql
{
  depositEvents(first: 20, orderBy: timestamp, orderDirection: desc) {
    user { id }
    amount
    timestamp
    txHash
  }
}
```

**查询某协议的所有持仓**

```graphql
{
  positions(where: { protocol: "0xAdapter地址", active: true }) {
    user { id }
    amount
    createdAt
  }
}
```

**IntentExecutor 批量执行记录**

```graphql
{
  intentsBatchEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
    user
    count
    timestamp
    txHash
  }
}
```

## 前端集成

```typescript
const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/<ID>/defi-pilot/version/latest";

async function querySubgraph(query: string) {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const { data } = await res.json();
  return data;
}

// 示例：获取全局统计
const stats = await querySubgraph(`{
  vaultStats(id: "global") {
    totalUsers
    totalDeposits
  }
}`);

// 示例：获取用户持仓
const userData = await querySubgraph(`{
  user(id: "${walletAddress.toLowerCase()}") {
    ethBalance
    positions(where: { active: true }) {
      protocol
      amount
    }
  }
}`);
```

## 数据模型说明

| 实体 | 说明 | 可变 |
|---|---|---|
| `VaultStats` | 全局统计（单例，id="global"） | ✅ |
| `User` | 用户聚合数据（余额、持仓数、活跃度） | ✅ |
| `Position` | 持仓记录（对应链上 Position struct） | ✅ |
| `DepositEvent` | 存款事件日志 | ❌ 不可变 |
| `WithdrawEvent` | 提款事件日志 | ❌ 不可变 |
| `StrategyEvent` | 策略执行事件日志 | ❌ 不可变 |
| `PositionClosedEvent` | 持仓关闭事件日志 | ❌ 不可变 |
| `ProtocolWhitelistEvent` | 协议白名单变更日志 | ❌ 不可变 |
| `IntentsBatchEvent` | 意图批量执行日志 | ❌ 不可变 |

## 本地开发（可选）

如果需要在本地运行 Graph Node 进行调试：

```bash
# 1. 需要 Docker 环境
# 2. 克隆 graph-node 并启动
git clone https://github.com/graphprotocol/graph-node
cd graph-node/docker

# 3. 编辑 docker-compose.yml，设置 ethereum RPC
# ethereum: 'sepolia:https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY'

# 4. 启动 Graph Node + IPFS + PostgreSQL
docker-compose up -d

# 5. 回到 subgraph 目录
cd ../../web3-hackathon/subgraph

# 6. 创建并部署到本地
npm run create-local
npm run deploy-local

# 7. 访问 http://localhost:8000/subgraphs/name/defi-pilot 查询
```

## 常见问题

**Q: 部署后一直显示 "Syncing"，很慢怎么办？**

A: 检查 `subgraph.yaml` 中的 `startBlock` 是否设置正确。如果设为 0 或很早的区块，需要扫描大量历史区块。建议设为合约部署区块号。

**Q: 查询返回空数据？**

A: 确认合约地址正确、网络匹配（sepolia）、且同步已完成（状态为 Synced）。注意 GraphQL 中的地址必须是**全小写**格式。

**Q: 如何更新 Subgraph？**

A: 修改代码后重新 `npm run build && npm run deploy`，输入新的版本号即可。Studio 会自动重新索引。

**Q: 免费额度够用吗？**

A: Subgraph Studio 每月 10 万次免费查询，对于 Hackathon 和中小型项目完全够用。
