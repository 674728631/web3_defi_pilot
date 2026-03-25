# DeFi Pilot — AI Cross-Chain DeFi Protocol

> "Tell AI what you want, it handles everything across chains."

DeFi Pilot 是一个 AI 驱动的意图化跨链 DeFi 协议。用户通过自然语言描述自己的 DeFi 意图（如 "我有 5 ETH，帮我找全网最高收益"），AI 自动分析多链多协议数据，生成最优策略推荐，并支持一键跨链执行。

## 核心特性

- **AI 策略引擎** — 自然语言交互，AI 解析用户意图并生成跨链投资策略
- **一键执行** — 策略自动编码为链上交易，用户钱包签名即完成存入/执行
- **实时仪表盘** — 链上真实数据驱动的持仓概览、APY 追踪、收益统计
- **风险监控** — 实时 Vault 健康度检测、持仓风险分布分析
- **AI 机会发现** — 接入 DeFi Llama 实时数据，发现高收益协议机会
- **可升级合约** — UUPS 代理模式，合约可安全迭代升级
- **Intent Protocol** — 意图驱动的合约架构，Solver 网络竞争最优执行路径

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite + TypeScript |
| 样式 | Tailwind CSS 4 |
| 状态 | Zustand |
| Web3 | wagmi v2 + viem + RainbowKit |
| 后端 | Go 1.25 + Gin + go-ethereum |
| AI | OpenAI API (GPT-4o-mini) + 本地策略回退引擎 |
| 合约 | Solidity 0.8.28 + Hardhat + OpenZeppelin Upgradeable (UUPS) |
| 链 | Sepolia + Arbitrum Sepolia (测试网) |

## 已部署合约 (Sepolia)

| 合约 | 代理地址 |
|------|---------|
| DeFiPilotVault | `0x55CAB33e07D3c99A008D18f96B04641E20D67550` |
| IntentExecutor | `0x7a24b1B70FB60c013513E475CC0107114c6eAbeB` |

## 快速开始

### 后端

```bash
cd backend
cp .env.example .env   # 配置 OpenAI Key、Solver 私钥、合约地址
go run main.go         # 启动在 http://localhost:3001
```

### 前端

```bash
cd frontend
npm install
cp .env.example .env   # 确认 VITE_BACKEND_URL
npm run dev            # 启动在 http://localhost:5173
```

### 智能合约

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test       # 31 个测试
```

部署到测试网:

```bash
cp .env.example .env   # 配置 PRIVATE_KEY、SEPOLIA_RPC_URL
npx hardhat run scripts/deploy.ts --network sepolia
```

## 项目结构

```
web3-hackathon/
├── backend/                # Go 后端服务
│   ├── main.go             # 入口 + 路由注册
│   ├── config/             # 多链配置管理
│   ├── contracts/          # 合约 ABI 常量
│   ├── handlers/           # HTTP 处理器
│   │   ├── ai.go           # POST /api/chat — AI 对话
│   │   ├── solver.go       # POST /api/execute — 策略执行
│   │   ├── tx.go           # GET /api/tx/:hash — 交易状态
│   │   ├── health.go       # GET /api/health/vault + /api/vault/balance
│   │   ├── portfolio.go    # GET /api/portfolio — 综合资产查询
│   │   └── opportunities.go # GET /api/opportunities — AI 机会
│   └── services/           # 业务逻辑
│       ├── openai.go       # OpenAI 调用 + 策略解析
│       ├── context.go      # 链上上下文构建
│       ├── registry.go     # 协议注册表 + DeFi Llama 实时 APY
│       ├── encoder.go      # 策略 → txParams 编码
│       └── solver.go       # Solver 链上交易广播
├── frontend/               # React + Vite 前端
│   └── src/
│       ├── components/     # UI 组件
│       │   ├── chat/       # ChatPanel, MessageBubble, StrategyCard
│       │   ├── dashboard/  # Dashboard, StatsRow, PositionCard, CrossChainFlow, InsightsRow
│       │   ├── common/     # ChainIcon, ParticleBackground, RiskBar
│       │   └── layout/     # TopNav
│       ├── hooks/          # useChat, useVault, useExecuteStrategy, useWithdraw
│       ├── services/       # AI 服务
│       ├── stores/         # Zustand: chatStore, portfolioStore, langStore
│       ├── utils/          # 合约地址, 链配置, i18n, 格式化
│       └── abi/            # 合约 ABI
├── contracts/              # Hardhat 智能合约
│   ├── contracts/
│   │   ├── DeFiPilotVault.sol      # 资金托管 (UUPS 可升级)
│   │   ├── IntentExecutor.sol      # 意图执行 (UUPS 可升级, EIP-712)
│   │   ├── AaveV3Adapter.sol       # Aave V3 适配器 (UUPS 可升级)
│   │   ├── interfaces/             # IAaveV3 接口
│   │   └── mocks/                  # V2 升级测试合约
│   ├── scripts/
│   │   ├── deploy.ts               # UUPS 代理部署脚本
│   │   └── upgrade.ts              # 合约升级脚本
│   └── test/                       # 31 个测试 (含升级测试)
├── docs/                   # 文档
│   ├── DESIGN.md           # 系统设计
│   ├── BACKEND_DESIGN.md   # 后端架构
│   ├── API.md              # API 接口文档
│   └── USER_MANUAL.md      # 用户操作手册
└── prototype/              # UI 原型参考
```

## 架构

```
用户自然语言意图
     │
     ▼
┌──────────────────────────────────────────────┐
│  AI 引擎 (OpenAI + 链上上下文 + 协议注册表)    │
│  → 生成策略 + 编码 txParams                    │
└──────────────────┬───────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │  direct 模式        │  solver 模式
         │  (用户钱包签名)      │  (后端代提交)
         ▼                     ▼
┌─────────────┐      ┌────────────────┐
│ Vault.deposit│      │ IntentExecutor │
│ 或            │      │ .executeBatch  │
│ depositAndExe│      │ (Solver签名)   │
└──────┬──────┘      └───────┬────────┘
       │                     │
       └─────────┬───────────┘
                 ▼
    ┌──────────────────────┐
    │  DeFiPilotVault      │
    │  (UUPS Proxy)        │
    │  → 记账 + 执行策略     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │  外部协议              │
    │  (Aave, Compound...)  │
    └──────────────────────┘
```

## 模块状态

| 模块 | UI | 数据 | 链上集成 |
|------|:--:|:----:|:--------:|
| AI 问答 | ✅ | ✅ | — |
| 一键执行 | ✅ | ✅ | ✅ |
| 修改策略 | ✅ | ✅ | — |
| 仪表盘统计 | ✅ | ✅ | ✅ |
| 活跃持仓 | ✅ | ✅ | ✅ |
| 赎回 | ✅ | ✅ | ✅ |
| 跨链流程 | ✅ | ✅ | — |
| 风险监控 | ✅ | ✅ | ✅ |
| AI 机会 | ✅ | ✅ | — |

## 文档

| 文档 | 说明 |
|------|------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | **部署指南**：合约部署、后端/前端启动、升级操作 |
| [docs/DESIGN.md](docs/DESIGN.md) | 系统设计：架构、资金流、安全机制 |
| [docs/BACKEND_DESIGN.md](docs/BACKEND_DESIGN.md) | 后端架构：模块设计、AI 引擎、请求链路 |
| [docs/API.md](docs/API.md) | API 接口规范 (7 个端点) |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | 用户操作手册 |

## License

MIT
