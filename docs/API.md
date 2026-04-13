# DeFi Pilot — API 接口文档

> 版本：v1  
> Base URL：`http://localhost:3001`  
> Content-Type：`application/json`

---

## 目录

1. [健康检查](#1-健康检查)
2. [AI 对话](#2-ai-对话)
3. [策略执行](#3-策略执行)
4. [交易状态查询](#4-交易状态查询)
5. [金库健康度](#5-金库健康度)
6. [用户 Vault 余额](#6-用户-vault-余额)
7. [综合资产查询](#7-综合资产查询)
8. [AI 机会发现](#8-ai-机会发现)
9. [多链健康监控](#9-多链健康监控)
10. [ETH 价格查询](#10-eth-价格查询)
11. [审计日志](#11-审计日志)
12. [数据结构定义](#12-数据结构定义)
13. [错误码](#13-错误码)

---

## 1. 健康检查

### GET /health

服务存活检查。

**请求参数：** 无

**响应示例：**

```json
{
  "status": "ok",
  "service": "defi-pilot-backend"
}
```

---

## 2. AI 对话

### POST /api/chat

核心接口 — 将用户消息发送给 AI 引擎，返回策略建议和预编码的交易参数。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | `ChatMessage[]` | 是 | 对话历史（含当前用户输入） |
| `userAddress` | `string` | 否 | 用户钱包地址（用于链上上下文查询） |
| `chainId` | `number` | 否 | 链 ID（默认 11155111 Sepolia） |

**ChatMessage：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | `string` | `"user"` 或 `"assistant"`（`"ai"` 会被自动转为 `"assistant"`） |
| `content` | `string` | 消息内容 |

**请求示例：**

```json
{
  "messages": [
    { "role": "user", "content": "把 2 ETH 投到低风险协议" }
  ],
  "userAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "chainId": 11155111
}
```

**响应体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | AI 回复文本（自然语言） |
| `strategy` | `Strategy \| null` | 策略对象（非策略类对话时为 null） |
| `txParams` | `TxParams \| null` | 预编码的交易参数（有策略时生成） |

**响应示例（含策略）：**

```json
{
  "text": "已分析您的需求。推荐将 2 ETH 分散投入以下低风险协议，综合年化约 3.54%。",
  "strategy": {
    "items": [
      {
        "chain": "sepolia",
        "protocol": "Aave V3",
        "action": "ETH Lending",
        "amount": "1.2 ETH",
        "apy": 3.12,
        "detail": "1.2 ETH → Sepolia Aave V3 · 低风险借贷"
      },
      {
        "chain": "sepolia",
        "protocol": "Lido",
        "action": "stETH Staking",
        "amount": "0.8 ETH",
        "apy": 3.95,
        "detail": "0.8 ETH → Sepolia Lido · 质押生息"
      }
    ],
    "totalApy": 3.45,
    "riskLevel": "Low",
    "estimatedYearlyReturn": 252
  },
  "txParams": {
    "mode": "solver",
    "eip712Domain": {
      "name": "DeFiPilot",
      "version": "1",
      "chainId": 11155111,
      "verifyingContract": "0x..."
    },
    "eip712Types": {
      "ExecuteBatch": [
        { "name": "user", "type": "address" },
        { "name": "intentsHash", "type": "bytes32" },
        { "name": "nonce", "type": "uint256" },
        { "name": "deadline", "type": "uint256" }
      ]
    },
    "eip712Message": {},
    "intents": [
      {
        "protocol": "0x...",
        "amount": "1200000000000000000",
        "data": "0x"
      },
      {
        "protocol": "0x...",
        "amount": "800000000000000000",
        "data": "0x"
      }
    ]
  }
}
```

**响应示例（direct 模式，Adapter 部署后激活）：**

```json
{
  "text": "推荐将 2 ETH 全部存入 Aave V3...",
  "strategy": { "..." : "..." },
  "txParams": {
    "mode": "direct",
    "to": "0x...vault",
    "functionName": "depositAndExecute",
    "args": ["0x...adapter", "0x...calldata"],
    "value": "2000000000000000000",
    "chainId": 11155111
  }
}
```

**响应示例（非策略对话）：**

```json
{
  "text": "DeFi（去中心化金融）是基于区块链的金融服务...",
  "strategy": null,
  "txParams": null
}
```

**降级机制：** 若 `OPENAI_API_KEY` 未配置或 OpenAI 调用失败，自动使用本地 fallback 策略生成器，基于关键词匹配风险偏好和金额，从协议注册表中筛选推荐。

---

## 3. 策略执行

### POST /api/execute

将用户签名的策略提交给 Solver 上链执行。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userAddress` | `string` | 是 | 用户钱包地址 |
| `chainId` | `number` | 是 | 链 ID |
| `intents` | `IntentParam[]` | 是 | 意图数组 |
| `deadline` | `number` | 否 | 签名过期时间戳（unix） |
| `signature` | `string` | 否 | EIP-712 签名（hex） |

**IntentParam：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `protocol` | `string` | 目标协议合约地址 |
| `amount` | `string` | 金额（wei 字符串） |
| `data` | `string` | calldata（hex 编码） |

**请求示例（带签名）：**

```json
{
  "userAddress": "0x1234...",
  "chainId": 11155111,
  "intents": [
    {
      "protocol": "0xAbCd...",
      "amount": "2000000000000000000",
      "data": "0x"
    }
  ],
  "deadline": 1711065600,
  "signature": "0x1234abcd..."
}
```

**响应体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `txHash` | `string` | 交易哈希 |
| `status` | `string` | `"submitted"` 或 `"failed"` |
| `error` | `string` | 错误信息（失败时） |

**响应示例：**

```json
{
  "txHash": "0xabc123...",
  "status": "submitted"
}
```

**执行路径：**

- 有 `signature` + `deadline` → 调用 `executeBatchWithSig`（EIP-712 验签）
- 无 `signature` → 调用 `executeBatch`（Solver 直接执行）

**当前状态：** 两个路径均已实现真实交易广播 — Solver 使用配置的私钥签名并通过 RPC 提交交易上链。

---

## 4. 交易状态查询

### GET /api/tx/:hash

查询交易回执和状态。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `hash` | `string` | 交易哈希 |

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `chainId` | `string` | `"11155111"` | 链 ID |

**请求示例：**

```
GET /api/tx/0xabc123...?chainId=11155111
```

**响应体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `txHash` | `string` | 交易哈希 |
| `status` | `string` | `"pending"` / `"success"` / `"failed"` |
| `blockNumber` | `number` | 区块号（pending 时为 0） |
| `gasUsed` | `number` | Gas 消耗（pending 时为 0） |

**响应示例（成功）：**

```json
{
  "txHash": "0xabc123...",
  "status": "success",
  "blockNumber": 12345678,
  "gasUsed": 185432
}
```

**响应示例（待确认）：**

```json
{
  "txHash": "0xabc123...",
  "status": "pending",
  "blockNumber": 0,
  "gasUsed": 0
}
```

---

## 5. 金库健康度

### GET /api/health/vault

查询 Vault 合约的资金健康度。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `chainId` | `string` | `"11155111"` | 链 ID |

**请求示例：**

```
GET /api/health/vault?chainId=11155111
```

**响应体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `chainId` | `number` | 链 ID |
| `vaultAddress` | `string` | Vault 合约地址 |
| `actualBalance` | `string` | 合约实际 ETH 余额（wei） |
| `totalAccounted` | `string` | 用户总账面余额（wei） |
| `healthy` | `boolean` | 是否健康（`actual >= accounted`） |

**响应示例：**

```json
{
  "chainId": 11155111,
  "vaultAddress": "0x...",
  "actualBalance": "5000000000000000000",
  "totalAccounted": "4800000000000000000",
  "healthy": true
}
```

**说明：** 调用链上 `vault.getHealthFactor()` 函数，返回三元组 `(actualBalance, totalAccounted, healthy)`。

---

## 6. 用户 Vault 余额

### GET /api/vault/balance

查询用户在 Vault 中的 ETH 余额。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `address` | `string` | — | 用户钱包地址（必填） |
| `chainId` | `string` | `"11155111"` | 链 ID |

**请求示例：**

```
GET /api/vault/balance?address=0x1234...&chainId=11155111
```

**响应体：**

```json
{
  "chainId": 11155111,
  "address": "0x1234...",
  "ethBalance": "0.500000",
  "weiBalance": "500000000000000000"
}
```

---

## 7. 综合资产查询

### GET /api/portfolio

一站式查询用户的完整资产数据：钱包余额、Vault 余额、链上持仓、健康度、APY 统计。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `address` | `string` | — | 用户钱包地址（必填） |
| `chainId` | `string` | `"11155111"` | 链 ID |

**请求示例：**

```
GET /api/portfolio?address=0x1234...&chainId=11155111
```

**响应体：**

```json
{
  "chainId": 11155111,
  "chainName": "Sepolia",
  "address": "0x1234...",
  "walletEth": "2.500000",
  "vaultEth": "1.000000",
  "vaultWei": "1000000000000000000",
  "totalUsd": 12775.0,
  "positionCount": 1,
  "positions": [
    {
      "id": 0,
      "protocol": "0xAbCd...",
      "protocolName": "Aave V3",
      "asset": "ETH",
      "amount": "0.500000",
      "receivedToken": "0x...",
      "receivedAmount": "500000000000000000",
      "timestamp": 1711065600,
      "active": true,
      "apy": 3.12,
      "riskLevel": "Low"
    }
  ],
  "healthy": true,
  "avgApy": 3.12,
  "activeChains": ["SEP"],
  "earned30d": 9.5,
  "queriedAt": "2026-03-20T10:00:00Z"
}
```

---

## 8. AI 机会发现

### GET /api/opportunities

返回所有已注册协议按 APY 排序的高收益机会列表，数据来自 DeFi Llama 实时 APY。

**请求参数：** 无

**请求示例：**

```
GET /api/opportunities
```

**响应体：**

```json
{
  "opportunities": [
    {
      "protocol": "GMX",
      "chainId": 421614,
      "apy": 8.50,
      "tvl": 520000000,
      "risk": "Medium",
      "audited": true
    },
    {
      "protocol": "Compound V3",
      "chainId": 11155111,
      "apy": 4.25,
      "tvl": 3200000000,
      "risk": "Low",
      "audited": true
    }
  ]
}
```

---

## 9. 多链健康监控

### GET /api/health/chains

对所有已配置的链发起 RPC 心跳（`eth_blockNumber`），返回每条链的连接状态、延迟和最新区块高度。前端 TopNav 和 ChatPanel 使用此接口实时展示链状态。

**请求参数：** 无

**请求示例：**

```
GET /api/health/chains
```

**响应体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `chains` | `ChainStatus[]` | 各链状态数组 |
| `total` | `number` | 总链数 |
| `healthy` | `number` | 健康链数 |

**ChainStatus：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `chainId` | `number` | 链 ID |
| `name` | `string` | 链名称（如 "Ethereum"、"Arbitrum"） |
| `status` | `string` | `"ok"` 或 `"error"` |
| `latency_ms` | `number` | RPC 响应延迟（毫秒） |
| `block` | `number` | 最新区块高度（仅 status=ok 时有值） |

**响应示例：**

```json
{
  "chains": [
    { "chainId": 1, "name": "Ethereum", "status": "ok", "latency_ms": 285, "block": 24783805 },
    { "chainId": 42161, "name": "Arbitrum", "status": "ok", "latency_ms": 292, "block": 447870944 },
    { "chainId": 10, "name": "Optimism", "status": "ok", "latency_ms": 1044, "block": 149718173 },
    { "chainId": 8453, "name": "Base", "status": "ok", "latency_ms": 457, "block": 44122889 },
    { "chainId": 137, "name": "Polygon", "status": "ok", "latency_ms": 890, "block": 84957539 },
    { "chainId": 43114, "name": "Avalanche", "status": "ok", "latency_ms": 483, "block": 81821877 },
    { "chainId": 11155111, "name": "Sepolia", "status": "ok", "latency_ms": 3184, "block": 10566628 },
    { "chainId": 421614, "name": "Arbitrum Sepolia", "status": "ok", "latency_ms": 1173, "block": 255605146 }
  ],
  "total": 8,
  "healthy": 8
}
```

**说明：** 遍历 `config.C.Chains` 中所有链配置，对每条链使用 `ethclient.DialContext` + `client.BlockNumber` 做心跳，超时 5 秒。新增链只需在 `config.go` 中添加配置即可自动纳入检查。

---

## 10. ETH 价格查询

### GET /api/price/eth

返回 ETH 的当前 USD 价格（从 CoinGecko 获取，带缓存）。

**请求参数：** 无

**响应示例：**

```json
{
  "symbol": "ETH",
  "usd": 3650.42
}
```

---

## 11. 审计日志

### GET /api/audit/logs

查询链上操作审计日志。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `event` | `string` | — | 按事件类型过滤 |
| `user` | `string` | — | 按用户地址过滤 |
| `tx` | `string` | — | 按交易哈希过滤 |
| `limit` | `number` | `50` | 返回条数 |
| `offset` | `number` | `0` | 分页偏移 |

**响应示例：**

```json
{
  "total": 12,
  "records": [
    {
      "id": 1,
      "event_type": "deposit",
      "user_address": "0x1234...",
      "tx_hash": "0xabcd...",
      "amount": "1000000000000000000",
      "created_at": "2026-03-20T10:00:00Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### GET /api/audit/stats

返回审计统计概要。

**请求参数：** 无

**响应示例：**

```json
{
  "total_events": 42,
  "by_type": {
    "deposit": 15,
    "withdraw": 8,
    "execute": 19
  }
}
```

---

## 12. 数据结构定义

### Strategy

```typescript
interface Strategy {
  items: StrategyItem[]
  totalApy: number            // 加权平均年化（%）
  riskLevel: "Low" | "Medium" | "High"
  estimatedYearlyReturn: number  // 预估年收益（USD）
}
```

### StrategyItem

```typescript
interface StrategyItem {
  chain: string               // 链名（如 "sepolia", "arbitrumSepolia"）
  protocol: string            // 协议名（如 "Aave V3"）
  action: string              // 操作类型（如 "ETH Lending"）
  amount: string              // 金额（如 "2.0 ETH"）
  apy: number                 // 单项年化（%）
  detail: string              // 描述文本
}
```

### TxParams

```typescript
interface TxParams {
  mode: "direct" | "solver"

  // direct 模式（用户直接发交易）
  to?: string                 // 目标合约地址
  functionName?: string       // 函数名
  args?: unknown[]            // 函数参数
  value?: string              // ETH 金额（wei 字符串）
  chainId?: number

  // solver 模式（用户签名 → 后端提交）
  eip712Domain?: {
    name: string              // "DeFiPilot"
    version: string           // "1"
    chainId: number
    verifyingContract: string // IntentExecutor 地址
  }
  eip712Types?: Record<string, Array<{name: string, type: string}>>
  eip712Message?: Record<string, unknown>
  intents?: IntentParam[]
}
```

### IntentParam

```typescript
interface IntentParam {
  protocol: string            // 协议合约地址
  amount: string              // 金额（wei 字符串）
  data: string                // calldata（hex）
}
```

---

## 13. 错误码

| HTTP 状态码 | 场景 | 响应体示例 |
|------------|------|-----------|
| 200 | 成功 | 见各接口响应示例 |
| 400 | 请求参数错误 | `{ "error": "Invalid request body" }` |
| 400 | 用户地址无效 | `{ "error": "Invalid user address" }` |
| 400 | 不支持的链 | `{ "error": "Unsupported chain" }` |
| 500 | OpenAI 调用失败（已降级） | 仍返回 200 + fallback 策略 |
| 500 | RPC 连接失败 | `{ "error": "Failed to connect to RPC" }` |
| 500 | 合约调用失败 | `{ "error": "Failed to call vault" }` |

---

## 附录：cURL 示例

### AI 对话

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "把 2 ETH 投到低风险协议"}],
    "userAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "chainId": 11155111
  }'
```

### 策略执行

```bash
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x1234...",
    "chainId": 11155111,
    "intents": [{"protocol": "0xAbCd...", "amount": "2000000000000000000", "data": "0x"}],
    "deadline": 1711065600,
    "signature": "0x..."
  }'
```

### 交易状态

```bash
curl "http://localhost:3001/api/tx/0xabc123...?chainId=11155111"
```

### 金库健康度

```bash
curl "http://localhost:3001/api/health/vault?chainId=11155111"
```

### 用户 Vault 余额

```bash
curl "http://localhost:3001/api/vault/balance?address=0x1234...&chainId=11155111"
```

### 综合资产查询

```bash
curl "http://localhost:3001/api/portfolio?address=0x1234...&chainId=11155111"
```

### AI 机会发现

```bash
curl "http://localhost:3001/api/opportunities"
```

### 多链健康监控

```bash
curl "http://localhost:3001/api/health/chains"
```

### ETH 价格

```bash
curl "http://localhost:3001/api/price/eth"
```

### 审计日志

```bash
curl "http://localhost:3001/api/audit/logs?limit=20"
```

### 审计统计

```bash
curl "http://localhost:3001/api/audit/stats"
```

### 服务健康检查

```bash
curl http://localhost:3001/health
```
