# DeFi Pilot — 用户操作说明书

> 面向 **终端用户** 与 **演示/测试人员**  
> 当前为 **测试网环境**；链上交易使用测试 ETH。

---

## 1. 产品简介

**DeFi Pilot** 是一个 AI 驱动的 DeFi 策略引擎。您只需用自然语言描述投资意图（如"把 2 ETH 投到低风险协议"），AI 即可分析多链多协议数据，生成最优策略并编码为可执行的链上交易。您只需一键确认，即可完成从存入到 Aave、Compound、Lido、Uniswap 等协议的完整交互。

**当前已集成 4 个协议，覆盖 3 大赛道：**

| 协议 | 赛道 | 类型 | 风险 |
|------|------|------|------|
| **Aave V3** | 借贷 | 真实协议 | Low |
| **Compound V3** | 借贷 | 真实协议 | Low |
| **Lido** | ETH 质押 | Mock（Sepolia 上 Lido 已弃用） | Low |
| **Uniswap V3** | DEX 流动性提供 | 真实协议 | Medium |

**核心流程：**  
`对话 → AI 策略 → 一键确认 → 链上执行 → 查看真实持仓 → 随时赎回`

---

## 2. 使用前准备

### 2.1 终端用户

| 项目 | 说明 |
|------|------|
| 浏览器 | Chrome / Edge 等 Chromium 内核浏览器 |
| 钱包 | 安装 **MetaMask** 或其它兼容钱包扩展 |
| 网络 | 将钱包切换到 **Sepolia** 或 **Arbitrum Sepolia** |
| 测试币 | 从水龙头领取对应网络的 **测试 ETH** |

### 2.2 自建环境（开发者/管理员）

**启动后端：**

```bash
cd backend
cp .env.example .env
# 编辑 .env：填入 OPENAI_API_KEY、SOLVER_PRIVATE_KEY、RPC URL、合约地址等
go run main.go
# 服务启动在 http://localhost:3001
```

**启动前端：**

```bash
cd frontend
cp .env.example .env
# 编辑 .env：确认 VITE_BACKEND_URL=http://localhost:3001
npm install
npm run dev
# 浏览器访问 http://localhost:5173
```

**部署合约（若需要）：**

```bash
cd contracts
npm install
cp .env.example .env
# 编辑 .env：填入 PRIVATE_KEY、RPC URL
# 若需 Aave 集成，还需填入 AAVE_GATEWAY_ADDRESS, AAVE_POOL_ADDRESS, AAVE_AWETH_ADDRESS
npx hardhat run scripts/deploy.ts --network sepolia
```

部署脚本会输出 `deployed-addresses.json` 并自动写入前端配置目录。

---

## 3. 界面概览

| 区域 | 功能 |
|------|------|
| **顶部导航** | Logo、导航入口、**语言切换（中/英）**、网络状态、**连接钱包** |
| **左侧聊天** | 与 AI 对话，描述投资意图；收到 **策略推荐卡片** |
| **右侧仪表盘** | 资产统计、活跃持仓、跨链流示意、风险与机会洞察 |

---

## 4. 连接钱包

1. 点击右上角 **「连接钱包」**。
2. MetaMask 弹出后，选择账户并确认连接。
3. 连接成功后显示缩短的钱包地址与当前链名称。
4. 若网络不对，在 MetaMask 中切换到 **Sepolia** 或 **Arbitrum Sepolia**。

**常见问题：**
- 没有弹出钱包 → 检查扩展是否启用、浏览器是否拦截弹窗。
- 连接后无数据 → 确认合约已部署且地址已配置。

---

## 5. 语言切换

点击顶栏 **🌐 EN** / **🌐 中**，界面文案在英文与简体中文之间切换。

---

## 6. 与 AI 对话

### 6.1 发起对话

在左侧输入框输入投资意图，例如：

- "把 2 ETH 投到低风险协议"
- "我有 5 ETH，想要高收益，可以接受中等风险"
- "帮我分散投资到 Aave 和 Lido"
- "帮我把 1 ETH 质押到 Lido 赚利息"
- "投 0.5 ETH 到 Compound"
- "帮我用 1 ETH 做 Uniswap 的流动性提供"

发送后等待 AI 回复。AI 会分析您的链上状态（余额、持仓）和多个协议的数据，生成策略建议。

### 6.2 策略推荐卡片

AI 回复中包含策略卡片，展示：
- 推荐的协议、链、操作类型
- 各笔投入金额和预期 APY
- 综合年化收益率和风险等级
- 预估年收益（USD）

### 6.3 一键执行

点击策略卡片上的 **「一键执行」** 按钮：

1. **MetaMask 弹出确认交易**（无需手动输入任何参数）
2. 确认后等待交易上链
3. 交易成功后，仪表盘自动更新持仓数据

**技术说明：** 后端已将策略转换为完整的交易参数（合约地址、函数、calldata、金额），前端直接使用，用户只需签名确认。

### 6.4 修改策略

**方式一（快捷）：** 点击策略卡片上的 **「修改」** 按钮，聊天输入框会自动填入当前策略摘要，您只需补充修改意向即可。

**方式二（手动）：** 直接在聊天框中继续对话：
- "风险太高了，换个保守点的方案"
- "能不能全部投到 Aave？"

AI 会根据您的反馈重新生成策略。

---

## 7. 仪表盘

### 7.1 资产统计（实时链上数据）

连接钱包后，仪表盘自动从后端 `/api/portfolio` 拉取链上数据，每 30 秒刷新：

- **总资产**：钱包余额 + 金库余额（转换为 USD）
- **活跃链数**：当前有持仓的链数量
- **综合 APY**：加权平均年化收益率
- **月收益**：近 30 天估算收益

### 7.2 持仓卡片

**DeFi Pilot Vault 持仓**（自动生成）：
- 当您在 Vault 中有 ETH 时，自动显示一张 Vault 持仓卡
- 显示金库内 ETH 余额
- 提供 **「Withdraw X ETH」** 按钮，一键提取到钱包

**协议持仓**：
- 协议名称和链
- 投入金额和当前余额
- 实时收益 = 当前余额 - 初始投入

### 7.3 跨链流程图

根据当前状态动态变化：
- **有 AI 策略待执行时** → 展示策略资金流向（用户 → 链 → 协议）
- **有活跃持仓时** → 展示资金分布拓扑
- **无数据时** → 展示项目架构概览

### 7.4 风险监控

实时从后端获取 Vault 健康度：
- 绿色 = 健康（合约实际 ETH ≥ 用户总余额）
- 红色 = 异常（需关注）
- 同时分析持仓的风险分布情况

### 7.5 AI 机会

从后端 `/api/opportunities` 获取按 APY 排序的协议列表，展示当前可获得的高收益机会（数据源：DeFi Llama 实时数据）。

---

## 8. 链上操作

### 8.1 一键投入协议（depositAndExecute）

点击策略卡片的 **「一键执行」** 按钮后：

1. **MetaMask 弹出确认交易**（Gas Limit: 300,000–500,000，视协议而定）
2. 前端调用 Vault 合约的 `depositAndExecute(adapterAddress)`，附带 ETH
3. **资金流转**（一笔交易完成，以下为各协议的流转路径）：

**Aave V3：**
```
钱包 ETH → Vault → AaveV3Adapter → Aave Gateway → Aave Pool
                                                      ↓
                                              Vault 收到 aWETH
```

**Compound V3：**
```
钱包 ETH → Vault → CompoundV3Adapter → WETH 包装 → Comet Supply
                                                      ↓
                                              Vault 收到 Comet 份额
```

**Lido（Mock）：**
```
钱包 ETH → Vault → LidoAdapter → MockStETH.submit → Mint stETH
                                                      ↓
                                              Vault 收到 stETH
```

**Uniswap V3：**
```
钱包 ETH → Vault → UniswapV3Adapter → WETH 包装 → NonfungiblePositionManager.mint
                                                      ↓
                                     Adapter 持有 NFT LP 头寸
                                     Vault 收到 dpUNI3 份额凭证
```

4. 交易确认后：
   - 聊天面板显示 **Etherscan 链接**
   - 仪表盘的 **ACTIVE POSITIONS** 自动显示 Aave V3 持仓卡片
   - **TOTAL ASSETS** 自动更新

**注意**：若 AI 推荐的协议没有部署 Adapter，会走 `deposit()` 路径，ETH 仅存入金库余额。

### 8.2 从 DeFi 协议赎回（withdrawFromProtocol）

在 ACTIVE POSITIONS 中的协议持仓卡片上，点击 **「从 XXX 赎回」** 按钮：

1. MetaMask 弹出确认交易（Gas Limit: 500,000）
2. **资金流转**（一笔交易完成）：

**Aave V3 赎回：**
```
Vault 将 aWETH 转给 Adapter → Adapter 通过 Gateway 从 Aave Pool 取回 ETH → 返回 Vault 余额
```

**Compound V3 赎回：**
```
Vault 将 Comet 份额转给 Adapter → Adapter 调 comet.withdraw(max) → WETH 解包 → ETH 返回 Vault 余额
```

**Lido 赎回：**
```
Vault 将 stETH 转给 Adapter → MockStETH.withdraw (burn stETH) → ETH 返回 Vault 余额
```

**Uniswap V3 赎回：**
```
Vault 将 dpUNI3 转给 Adapter → Adapter 移除 LP 流动性 → Collect 回收资产 → WETH 解包 → ETH 返回 Vault 余额
```

3. 赎回完成后：
   - 协议持仓卡片消失（Position 标记为 inactive）
   - Vault 余额增加（可能因 Aave 利息而略多于投入金额）
   - 聊天面板显示赎回成功通知

### 8.3 从 Vault 提取到钱包

赎回后，ETH 进入 Vault 的用户余额。在 **DeFi Pilot Vault** 持仓卡片上点击 **「赎回 X ETH」**：

1. MetaMask 弹出确认交易
2. Vault 中的 ETH 转入您的钱包
3. 交易确认后仪表盘自动刷新

### 8.4 完整资金流程

```
存入：  钱包 ETH → Vault → Adapter → 协议（获得 receipt token）
赎回：  协议 → Adapter 解包 → ETH 返回 Vault 余额
提取：  Vault 余额 → 钱包 ETH
```

> 所有协议的存入/赎回/提取流程完全一致，Vault 合约和前端代码**零改动**即可支持新协议，只需部署新 Adapter + 后端注册。

### 8.5 安全提示

- 将 ETH 存入金库即表示信任项目方配置的合规操作体系，详见 `docs/DESIGN.md` 第 5 节。
- **仅使用测试网资金**。
- 保管好钱包助记词/私钥，不要向任何人泄露。
- 链上执行需要 Gas 费（测试 ETH），每次交易约消耗 250,000-500,000 gas（视协议复杂度而定）。

---

## 9. 用户故事（典型操作场景）

### 故事 1：保守型 — 存 ETH 到 Aave V3 赚借贷利息

> **场景**：用户有 2 ETH 闲置资金，希望稳健地赚取借贷利息，不愿承担过高风险。

**操作步骤：**
1. 连接 MetaMask → 切换到 Sepolia
2. 在聊天框输入：**"我有 2 ETH，帮我找一个低风险的借贷协议"**
3. AI 回复推荐 Aave V3（APY 约 2.85%，Low 风险，Audited）
4. 点击策略卡片的**「一键执行」**
5. MetaMask 确认交易 → 等待上链
6. 仪表盘显示 **Aave V3** 持仓卡片，实时显示利息增长

**赎回**：点击持仓卡片的**「从 Aave V3 赎回」** → 资金退回 Vault → 再点**「提取」**到钱包

---

### 故事 2：进取型 — 存 ETH 到 Compound V3 赚供给利率

> **场景**：用户想尝试 Compound 协议，对比不同借贷平台的利率。

**操作步骤：**
1. 在聊天框输入：**"投 1 ETH 到 Compound"**
2. AI 推荐 Compound V3 ETH Supply（APY 约 3.60%）
3. 一键执行 → MetaMask 确认
4. 仪表盘显示 **Compound V3** 持仓

**特殊注意**：Compound V3 的内部余额计算有微小的取整误差。赎回时 Adapter 自动使用 `type(uint256).max` 全额提取，避免因精度问题失败。

---

### 故事 3：质押型 — 质押 ETH 到 Lido 获取 stETH

> **场景**：用户想参与以太坊 PoS 质押，但不想运行验证节点。

**操作步骤：**
1. 在聊天框输入：**"帮我把 1 ETH 质押到 Lido 赚利息"**
2. AI 推荐 Lido stETH Staking（APY 约 3.25%，Low 风险）
3. 一键执行 → ETH 转换为 stETH
4. 仪表盘显示 **Lido** 持仓

**注意**：当前为 Mock 环境（Lido 官方已弃用 Sepolia 测试网）。Mock 合约按 1:1 铸造 stETH，不含真实的 rebasing 利息机制。主网上线时可替换为真实 Lido 合约。

---

### 故事 4：流动性提供型 — 在 Uniswap V3 做 LP

> **场景**：用户想通过为 DEX 提供流动性来赚取交易手续费。

**操作步骤：**
1. 在聊天框输入：**"帮我用 0.5 ETH 做 Uniswap V3 的流动性提供"**
2. AI 推荐 Uniswap V3 ETH LP（APY 约 5.20%，Medium 风险）
3. 一键执行 → ETH 包装为 WETH → 创建 LP 头寸
4. 仪表盘显示 **Uniswap V3** 持仓

**技术说明**：Uni V3 的 LP 头寸为 ERC-721 NFT，由 Adapter 内部持有。Vault 通过 ERC-20 份额凭证 (dpUNI3) 追踪用户权益。赎回时 Adapter 自动移除流动性、回收资产、解包 WETH 并返还 ETH。

---

### 故事 5：AI 自主推荐 — 不指定协议

> **场景**：用户不确定选哪个协议，完全依赖 AI 推荐。

**操作步骤：**
1. 在聊天框输入：**"我有 3 ETH，帮我找最优策略"**
2. AI 综合分析 4 个协议的实时 APY、风险等级、TVL，给出最优推荐
3. 若不满意，可继续对话：**"风险太高了，换个保守的"** 或 **"收益能不能更高？"**
4. AI 根据反馈重新生成策略

---

## 10. 后端服务管理（管理员）

### 9.1 健康检查

```bash
# 服务存活检查
curl http://localhost:3001/health

# 金库健康度
curl "http://localhost:3001/api/health/vault?chainId=11155111"
```

### 9.2 交易状态查询

```bash
curl "http://localhost:3001/api/tx/0x...?chainId=11155111"
```

### 9.3 资产组合查询

```bash
curl "http://localhost:3001/api/portfolio?address=0x...&chainId=11155111"
```

### 9.4 Vault 余额查询

```bash
curl "http://localhost:3001/api/vault/balance?address=0x...&chainId=11155111"
```

### 9.5 AI 机会查询

```bash
curl "http://localhost:3001/api/opportunities?chainId=11155111"
```

### 9.6 环境变量

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API Key（无则使用本地降级策略） |
| `SOLVER_PRIVATE_KEY` | Solver 钱包私钥 |
| `SEPOLIA_RPC_URL` | Sepolia 链 RPC |
| `VAULT_ADDRESS_SEPOLIA` | Vault 合约地址 |
| `EXECUTOR_ADDRESS_SEPOLIA` | Executor 合约地址 |
| `ADAPTER_ADDRESS_SEPOLIA` | Aave Adapter 地址 |
| `COMPOUND_ADAPTER_ADDRESS_SEPOLIA` | Compound V3 Adapter 地址 |
| `LIDO_ADAPTER_ADDRESS_SEPOLIA` | Lido Adapter 地址 |
| `UNISWAP_V3_ADAPTER_ADDRESS_SEPOLIA` | Uniswap V3 Adapter 地址 |

完整列表见 `backend/.env.example`。

---

## 11. 合约部署（管理员）

```bash
cd contracts
npm install
npx hardhat run scripts/deploy.ts --network sepolia
```

部署输出包含 Vault、Executor、Adapter（若配置了 Aave 地址）的合约地址。  
`deployed-addresses.json` 自动写入 `contracts/` 和 `frontend/src/utils/`。

---

## 12. 运行测试（开发者）

```bash
cd contracts
npx hardhat test
```

覆盖：存取款、权限控制、Aave 完整生命周期、健康度检查。

---

## 13. 常见问题（FAQ）

| 问题 | 处理建议 |
|------|----------|
| 页面很暗看不清 | 主题为深色赛博风格，可调整显示器亮度 |
| 连接钱包无反应 | 检查扩展、弹窗拦截、网络与配置是否一致 |
| AI 回复没有策略卡片 | 确认后端已启动、OPENAI_API_KEY 已配置；或检查对话内容是否为投资相关 |
| 一键执行失败 | 检查钱包余额是否足够支付 Gas + 投入金额 |
| 金库余额始终为 0 | 检查合约地址是否已配置、是否在同一链上操作 |
| 想切换语言 | 使用顶栏语言切换按钮 |
| 后端无法启动 | 检查 Go 版本、.env 配置、端口是否被占用 |
| 赎回后看不到 ETH | 协议（如 Aave/Compound）赎回的资金会先退回 Vault 内的用户个人余额中。此时在 MetaMask 的“活动”中看不到收入记录（属于合约内部记账），页面会显示出 Vault ETH 余额卡片。您需点击 Vault 卡片的“赎回”才能提取到钱包。 |
| Compound 赎回报错 "NotEnoughBalance" | 这是 Compound V3 特有的本金/利息取整误差导致。Adapter 在提款时应避免提取精确查询到的余额数值，而应使用 `type(uint256).max` 提取全部本金，此问题已在最新代码中修复。 |
| 提取 Vault 余额报错 "Insufficient balance" | 属于典型的前端浮点数精度丢失问题。前端页面为美观将余额四舍五入（如显示 `1.000009`），但用户真实精确余额可能略小（如 `1.00000888...`）。前端直接用显示值换算成 wei 发起交易就会报错。已修复为前端直接读取链上 wei 单位的精确余额来提款。 |

---

## 14. 已部署合约地址（Sepolia）

| 合约 | 地址 | 说明 |
|------|------|------|
| DeFiPilotVault | `0x55CAB33e07D3c99A008D18f96B04641E20D67550` | 主金库（UUPS 代理） |
| IntentExecutor | `0x7a24b1B70FB60c013513E475CC0107114c6eAbeB` | 意图执行器 |
| AaveV3Adapter | `0x757537A14C90b0F5fc34Df503Cd12cfABfFCc2Ae` | Aave V3 适配器 |
| CompoundV3Adapter | `0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76` | Compound V3 适配器 |
| LidoAdapter | `0x7d6C6Cc74555CF69Ee88CF61612649EeB91183Fd` | Lido Mock 适配器 |
| MockStETH | `0x42FC8b114Fbc9800a96E24d4dbba43C9AEfc6205` | 模拟 stETH 合约 |
| UniswapV3Adapter | `0x215c0776f14a4473DcEDD6b5d6F13d4f4909248d` | Uniswap V3 适配器 |
| UniV3ReceiptToken | `0x7Db0c55D27F3B6546a143d605793c983D9c27c1e` | Uni V3 LP 份额凭证 |

---

## 15. 文档索引

| 文档 | 内容 |
|------|------|
| `docs/DESIGN.md` | 系统设计、资金流、安全模型 |
| `docs/BACKEND_DESIGN.md` | 后端服务架构、AI 引擎、模块设计 |
| `docs/API.md` | 后端 API 接口规范 |
| `README.md` | 项目总览 |

---

## 16. 免责声明

本说明书描述的是开发与演示环境下的操作方式。数字资产与 DeFi 存在 **本金损失、合约漏洞、钓鱼与误授权** 等风险。请务必 **自主研究（DYOR）**，仅使用您能承受损失的资金进行测试。
