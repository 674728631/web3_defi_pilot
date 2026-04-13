# DeFi Pilot — 后端服务设计文档

> 版本：v1 — 与 `backend/` 目录当前实现一致  
> 技术栈：Go 1.25 + Gin + go-ethereum  
> 服务端口：默认 3001

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| AI 决策下沉 | 前端不调用 OpenAI、不编码 calldata；后端完成「对话 → 策略 → 可执行交易」全链路 |
| API Key 安全 | OpenAI Key 和 Solver 私钥仅存在于后端 .env |
| 链上感知 | AI 提示词注入用户链上状态（余额、持仓数），使策略具备上下文 |
| 可扩展 | 新增协议只需在注册表添加条目，无需修改 AI prompt 或前端代码 |

---

## 2. 项目结构

```
backend/
├── main.go                    # 入口：路由注册、CORS、启动服务
├── go.mod / go.sum            # Go 模块依赖
├── .env / .env.example        # 环境变量
├── config/
│   └── config.go              # 配置加载 + 多链配置管理
├── contracts/
│   └── abi.go                 # Vault / Executor / Adapter / ERC20 ABI 常量
├── handlers/
│   ├── ai.go                  # POST /api/chat
│   ├── solver.go              # POST /api/execute
│   ├── tx.go                  # GET /api/tx/:hash
│   ├── health.go              # GET /api/health/vault + /api/vault/balance
│   ├── chains.go              # GET /api/health/chains — 多链 RPC 健康监控
│   ├── portfolio.go           # GET /api/portfolio — 综合资产查询
│   ├── opportunities.go       # GET /api/opportunities — AI 机会发现
│   └── audit.go               # GET /api/audit/logs + /api/audit/stats
└── services/
    ├── openai.go              # OpenAI 调用 + 策略解析 + fallback
    ├── context.go             # 链上上下文构建
    ├── registry.go            # 协议注册表 + DeFi Llama 实时 APY/TVL
    ├── encoder.go             # 策略 → txParams 编码（3 级降级路径）
    └── solver.go              # Solver 链上交易构建与广播
```

---

## 3. 模块详解

### 3.1 config/config.go — 配置管理

```go
type Config struct {
    Port          string
    FrontendOrigin string
    OpenAIKey     string
    OpenAIBaseURL string
    OpenAIModel   string
    SolverKey     string
    Chains        map[int64]*ChainConfig
}

type ChainConfig struct {
    RPCURL   string
    Vault    string
    Executor string
    Adapter  string
}
```

- `Load()` 从 `.env` 加载所有配置，初始化 **8 条链**：2 条测试网（Sepolia、Arbitrum Sepolia，含合约部署）+ 6 条主网（Ethereum、Arbitrum、Optimism、Base、Polygon、Avalanche，仅监控 RPC 健康）。
- `GetChain(chainId)` 返回对应链配置，不存在时返回 nil。

**环境变量清单：**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | HTTP 端口 |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS 允许的前端 origin |
| `OPENAI_API_KEY` | 空 | OpenAI API Key（空则走 fallback） |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容端点 |
| `OPENAI_MODEL` | `gpt-4o-mini` | 模型 ID |
| `SOLVER_PRIVATE_KEY` | 空 | Solver 钱包私钥（hex） |
| `SEPOLIA_RPC_URL` | `https://rpc.sepolia.org` | Sepolia RPC |
| `VAULT_ADDRESS_SEPOLIA` | 空 | Sepolia Vault 地址 |
| `EXECUTOR_ADDRESS_SEPOLIA` | 空 | Sepolia Executor 地址 |
| `ADAPTER_ADDRESS_SEPOLIA` | 空 | Sepolia Adapter 地址 |
| `ARB_SEPOLIA_RPC_URL` | `https://sepolia-rollup.arbitrum.io/rpc` | Arbitrum Sepolia RPC |
| `VAULT_ADDRESS_ARB` | 空 | Arb Sepolia Vault 地址 |
| `EXECUTOR_ADDRESS_ARB` | 空 | Arb Sepolia Executor 地址 |
| `ADAPTER_ADDRESS_ARB` | 空 | Arb Sepolia Adapter 地址 |
| `ETH_RPC_URL` | `https://eth.drpc.org` | Ethereum 主网 RPC（监控用） |
| `ARB_RPC_URL` | `https://arb1.arbitrum.io/rpc` | Arbitrum 主网 RPC（监控用） |
| `OP_RPC_URL` | `https://optimism.drpc.org` | Optimism 主网 RPC（监控用） |
| `BASE_RPC_URL` | `https://mainnet.base.org` | Base 主网 RPC（监控用） |
| `POLYGON_RPC_URL` | `https://polygon.drpc.org` | Polygon 主网 RPC（监控用） |
| `AVAX_RPC_URL` | `https://api.avax.network/ext/bc/C/rpc` | Avalanche 主网 RPC（监控用） |

### 3.2 services/registry.go — 协议注册表

```go
type ProtocolEntry struct {
    Name    string
    ChainID int64
    Adapter string            // Adapter 合约地址（空字符串表示未部署）
    AToken  string            // aToken 地址
    Actions map[string]ActionDef
    APY     float64
    Risk    string            // "Low" | "Medium" | "High"
    TVL     float64
    Audited bool
}

type ActionDef struct {
    FunctionSig string        // e.g. "depositETH(address)"
    GasEstimate uint64
}
```

**当前注册的协议：**

| 名称 | ChainID | Actions | APY | Risk |
|------|---------|---------|-----|------|
| Aave V3 | 11155111 | ETH Lending → `depositETH(address)` | 3.12% | Low |
| Lido | 11155111 | stETH Staking → `submit(address)` | 3.95% | Low |
| Compound V3 | 11155111 | USDC Supply → `supply(address,uint256)` | 4.25% | Low |
| Aave V3 | 421614 | ETH Lending → `depositETH(address)` | 4.82% | Low |
| GMX | 421614 | GLP Vault → `mintAndStakeGlp(...)` | 8.50% | Medium |

**关键函数：**

- `FindProtocol(name, chainId)` — 精确匹配名称和链 ID，返回 `*ProtocolEntry`
- `GetProtocolsByRisk(maxRisk)` — 按风险等级过滤
- `BuildProtocolContext()` — 生成协议摘要字符串，注入 AI system prompt

**扩展方式：** 在 `Registry` 切片中添加新的 `ProtocolEntry`，填入 Adapter 地址和 Action 定义。

### 3.3 services/context.go — 链上上下文

```go
func BuildOnChainContext(userAddr string, chainId int64) string
```

通过 ethclient 调用合约只读函数：

1. `vault.getUserBalance(userAddr)` → 用户余额（ETH，4 位小数）
2. `vault.getUserPositionCount(userAddr)` → 持仓数量
3. 组装中文上下文字符串注入 AI prompt

持仓详情通过 `/api/portfolio` 端点提供（见 `handlers/portfolio.go`），包含完整持仓列表、健康度等数据。

### 3.4 services/openai.go — AI 调用 + 策略解析

**System Prompt 结构：**

```
角色设定:
  You are DeFi Pilot AI, an expert DeFi strategy advisor.

协议数据:
  ${BuildProtocolContext()}

输出格式要求:
  1. 自然语言解释（2-3 句，与用户使用同一语言）
  2. ```json { items, totalApy, riskLevel, estimatedYearlyReturn } ```

规则:
  - 分散投资 ≥ 2 协议
  - 尊重用户风险偏好
  - 仅推荐已审计协议
  - totalApy 为加权平均
  - estimatedYearlyReturn 以 USD 计（ETH = $3650）

用户链上状态:
  ${BuildOnChainContext()}
```

**数据结构：**

```go
type Strategy struct {
    Items              []StrategyItem `json:"items"`
    TotalAPY           float64        `json:"totalApy"`
    RiskLevel          string         `json:"riskLevel"`
    EstimatedYearlyReturn float64     `json:"estimatedYearlyReturn"`
}

type StrategyItem struct {
    Chain    string  `json:"chain"`
    Protocol string  `json:"protocol"`
    Action   string  `json:"action"`
    Amount   string  `json:"amount"`    // e.g. "2.0 ETH"
    APY      float64 `json:"apy"`
    Detail   string  `json:"detail"`
}
```

**请求流程：**

1. 构建 messages：`[system, ...chatHistory]`
2. POST `{OpenAIBaseURL}/chat/completions`，temperature=0.7，max_tokens=1500
3. `parseStrategy()` 用正则提取 ` ```json ... ``` ` 块，解析为 Strategy
4. 失败/无 Key → `buildFallbackStrategy()`（本地生成：按风险筛选协议、分配比例、计算 APY）

### 3.5 services/encoder.go — 策略 → 交易参数（3 级降级路径）

**`EncodeStrategy(strategy, userAddr, chainId)` 流程：**

1. 计算策略中所有条目的总 ETH 金额
2. **路径 1**（Adapter 可用）：编码 `depositAndExecute(adapter, calldata)`，mode = `"direct"`
3. **路径 2**（无 Adapter 但有 Vault）：编码 `deposit()`，mode = `"direct"`
4. **路径 3**（都没有）：构建 EIP-712 意图，mode = `"solver"`

**当前 Sepolia 部署走路径 2** — 用户钱包直接签名存入 Vault。部署 AaveV3Adapter 后自动切换到路径 1。

### 3.6 services/solver.go — Solver 链上交易广播

**已实现真实交易广播。** 核心函数：

- `getSolverKey()` — 解析 SOLVER_PRIVATE_KEY
- `sendTransaction()` — 构建、签名（EIP-155）、广播交易
- `ExecuteWithSig()` — ABI 编码 `executeBatchWithSig` calldata + 广播
- `ExecuteBatch()` — ABI 编码 `executeBatch` calldata + 广播

所有交易使用 Solver 私钥签名，Gas Limit 500000，Gas Price 由 RPC 建议。

### 3.7 handlers/ — HTTP 处理器

| 文件 | 路由 | 职责 |
|------|------|------|
| `ai.go` | POST /api/chat | 解析请求 → BuildOnChainContext → CallOpenAI → EncodeStrategy → 返回 ChatResponse |
| `solver.go` | POST /api/execute | 区分 signature 有无 → ExecuteWithSig 或 ExecuteBatch（真实广播） |
| `tx.go` | GET /api/tx/:hash | ethclient.TransactionReceipt → pending/success/failed |
| `health.go` | GET /api/health/vault | 调用 vault.getHealthFactor → 返回健康度数据 |
| `health.go` | GET /api/vault/balance | 查询用户 Vault ETH 余额 |
| `portfolio.go` | GET /api/portfolio | 聚合钱包余额 + Vault 余额 + 链上持仓 + APY + 健康度 |
| `opportunities.go` | GET /api/opportunities | 返回按 APY 排序的协议机会列表 |
| `audit.go` | GET /api/audit/logs | 审计日志查询（支持按事件/用户/交易过滤、分页） |
| `audit.go` | GET /api/audit/stats | 审计统计概要 |
| `chains.go` | GET /api/health/chains | 遍历所有链配置做 RPC 心跳，返回各链状态/延迟/区块高度 |

### 3.8 contracts/abi.go — ABI 常量

存储四个合约的 ABI 字符串常量：

| 常量 | 合约 | 用途 |
|------|------|------|
| `VaultABI` | DeFiPilotVault | getUserBalance, getUserPositionCount, getHealthFactor |
| `ExecutorABI` | IntentExecutor | executeBatchWithSig |
| `ERC20ABI` | IERC20 | balanceOf（预留） |
| `AdapterABI` | AaveV3Adapter | depositETH 编码（预留） |

---

## 4. 请求处理流程

### 4.1 POST /api/chat 完整链路

```
前端 POST /api/chat
  { messages, userAddress, chainId }
        │
        ▼
  ① handlers/ai.go: 解析请求，规范化消息角色（ai→assistant）
        │
        ▼
  ② services/context.go: BuildOnChainContext
     ethclient → vault.getUserBalance → vault.getUserPositionCount
     → "用户 Vault 余额: 0.5000 ETH | 持仓: 2 个"
        │
        ▼
  ③ services/openai.go: CallOpenAI
     system prompt = 角色 + 协议注册表 + 链上上下文
     → POST OpenAI Chat Completions
     → parseStrategy(responseText)
     → 返回 { text, strategy }
        │
        ▼
  ④ services/encoder.go: EncodeStrategy（仅当 strategy 非空）
     → 查 registry → 编码 calldata → 返回 TxParams
        │
        ▼
  ⑤ 返回 ChatResponse { text, strategy, txParams }
```

### 4.2 POST /api/execute

```
前端 POST /api/execute
  { userAddress, chainId, intents, deadline, signature }
        │
        ▼
  handlers/solver.go: 判断是否有 signature
        │
        ├─ 有 signature → services/solver.go: ExecuteWithSig
        │   → ABI 编码 executeBatchWithSig calldata → Solver 签名 → 广播上链
        │
        └─ 无 signature → services/solver.go: ExecuteBatch
            → ABI 编码 executeBatch calldata → Solver 签名 → 广播上链
        │
        ▼
  返回 { txHash, status }
```

---

## 5. CORS 配置

```go
cors.Config{
    AllowOrigins: [FrontendOrigin, "http://localhost:5173", "http://localhost:5174"],
    AllowMethods: ["GET", "POST", "OPTIONS"],
    AllowHeaders: ["Content-Type", "Authorization"],
}
```

---

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| OpenAI API 不可用/无 Key | 自动降级到 `buildFallbackStrategy`，本地生成策略 |
| 链 RPC 不可用 | 返回空上下文，不影响 AI 调用 |
| 请求参数错误 | 返回 400 + 错误消息 |
| 合约调用失败 | 返回 500 + 错误详情 |
| TX 未上链 | /api/tx/:hash 返回 `status: "pending"` |

---

## 7. 已知限制与迭代方向

| 项目 | 当前状态 | 迭代方向 |
|------|---------|---------|
| 协议 APY | DeFi Llama 实时数据 + 本地兜底 | 增加更多数据源 |
| 链上上下文 | 余额+持仓数+持仓详情 | 增加 aToken 实时余额 |
| Solver 执行 | ✅ 已实现真实交易广播 | 多 Solver 竞价 |
| Direct 路径 | Vault deposit 已激活 | 部署 Adapter 后自动升级为 depositAndExecute |
| Portfolio API | ✅ 聚合钱包+Vault+持仓数据 | 增加多链聚合 |
| 持仓变更通知 | 前端 30s 轮询 | WebSocket 推送 |
| 多协议支持 | 注册表含 Aave、Lido、Compound、GMX | 扩展更多协议适配器 |
| 测试覆盖 | 无后端单元测试 | 添加 Go 测试 |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-20 | v1：初版 |
| 2026-03-20 | v2：更新 encoder 3 级降级、solver 真实广播、新增 portfolio/opportunities/vault-balance 端点 |
| 2026-04-01 | v3：新增多链健康监控（chains.go）、6 条主网链配置、审计日志端点 |
