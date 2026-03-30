# DeFi Pilot — 系统设计文档

> 版本：与仓库当前实现一致（Solidity 0.8.24 + Hardhat + React 前端）  
> 重点：**资金（ETH）流转**、**链上状态与数据模型**、**安全模型与风险**

---

## 1. 文档目的与范围

### 1.1 目的

- 说明链上模块（`DeFiPilotVault`、`IntentExecutor`）的职责边界与交互关系。  
- 用可审计的方式描述 **ETH 从用户到金库、再到外部协议** 的完整路径。  
- 列出 **已实现的安全机制**、**信任假设** 与 **已知限制**，便于评审与后续迭代。

### 1.2 范围

| 在范围内 | 不在本文档承诺范围内（产品愿景/待接入） |
|----------|----------------------------------------|
| 当前两个 Solidity 合约的行为 | 真实跨链桥、多链统一结算的链上证明 |
| Hardhat 测试与部署脚本 | 生产级 Solver 网络共识与 MEV 防护细节 |
| 前端中与金库读写相关的逻辑（`useVault`） | 已部署合约地址（需部署后自行填入配置） |

---

## 2. 系统架构总览

### 2.1 逻辑分层

```
┌────────────────────────────────────────────────────────────────┐
│  表现层：Web 前端（React + wagmi + RainbowKit）                 │
│  - 钱包连接、网络切换                                           │
│  - AI 对话 → 策略推荐 → 一键执行（depositAndExecute）           │
│  - 仪表盘：余额、持仓、赎回                                     │
└────────────────────────┬───────────────────────────────────────┘
                         │ RPC / 钱包签名交易
┌────────────────────────▼───────────────────────────────────────┐
│  链上执行层                                                      │
│                                                                  │
│  用户直接调用（Direct 模式）：                                    │
│    DeFiPilotVault.depositAndExecute(adapter) ──►                │
│    AaveV3Adapter.depositETH ──► Aave Gateway ──► Aave Pool     │
│                                                                  │
│  Solver 调用（Solver 模式）：                                    │
│    IntentExecutor.executeBatch ──► DeFiPilotVault.executeStrategy│
│                                                                  │
│  赎回：                                                          │
│    DeFiPilotVault.withdrawFromProtocol ──►                      │
│    AaveV3Adapter.withdrawETH ──► Aave Gateway ──► ETH 返回 Vault│
└────────────────────────────────────────────────────────────────┘
```

### 2.2 合约职责

| 合约 | 职责 |
|------|------|
| **DeFiPilotVault** | 核心金库。提供 `deposit`/`withdraw`（ETH 存取）、`depositAndExecute`（一键投入协议）、`withdrawFromProtocol`（从协议赎回）、`executeStrategy`（Solver 调用）。管理用户余额、持仓记录、协议白名单。 |
| **AaveV3Adapter** | Aave V3 协议适配器。通过 `WrappedTokenGateway` 将 ETH 存入/取出 Aave Pool。仅 Vault 可调用（`onlyVault`）。UUPS 可升级。 |
| **IntentExecutor** | 聚合多条「意图」为批量调用；仅 **Solver（及 Owner）** 可触发 `executeBatch`，进而调用 Vault 的 `executeStrategy`。 |

---

## 3. 链上数据模型

### 3.1 DeFiPilotVault

- **`_users[address].ethBalance`**  
  - 用户在金库内的 **可用 ETH 账面余额**（单位：wei）。  
  - 存款增加；提款或策略执行成功则减少。

- **`_users[address].positions`**  
  - 每次成功 `executeStrategy` 追加一条 `Position`：  
    - `protocol`、`amount`、`timestamp`、`active` 等。  
  - **注意**：当前实现中，资金已通过 `protocol.call{value: amount}(data)` 转出至外部协议；金库内 **仅保留记账与历史记录**，不自动同步外部协议的真实头寸或 ERC20 回流。

- **`whitelistedProtocols[protocol]`**  
  - 仅当为 `true` 时，`executeStrategy` 允许向该 `protocol` 发送 ETH + calldata。

- **`intentExecutor`**  
  - 被信任的 `IntentExecutor` 合约地址；与 `onlyExecutor` 修饰符配合使用。

### 3.2 IntentExecutor

- **`vault`**：绑定的 `DeFiPilotVault` 实例。  
- **`solvers[address]`**：允许调用 `executeBatch` 的链下/链上 Solver 地址。  
- **`Intent`**：`protocol`、`amount`、`data` 描述单次对外部协议的调用。

---

## 4. 资金（ETH）流转详解

以下均指 **单链、单 Vault 部署** 下的 ETH 流动；多链场景在产品层可复用同一套模型，但需 **每条链各自部署 Vault** 并分别持有该链原生资产。

### 4.1 用户存款（增加金库账面余额 + Vault 合约 ETH 余额）

**路径：** 用户 EOA → `DeFiPilotVault`

| 步骤 | 调用方式 | 链上效果 |
|------|----------|----------|
| 1 | 用户调用 `deposit()` 并附带 `msg.value > 0` | `_users[msg.sender].ethBalance += msg.value`；Vault 合约余额增加同等 ETH |
| 2 | 用户直接向 Vault 地址转账 ETH | 触发 `receive()` → 内部调用 `deposit()`，效果同上 |

**要点：**

- 账面余额的归属键为 **`msg.sender`**（存款方），与「谁发起交易」一致。  
- `deposit` / `receive` 均带 `nonReentrant`，与 `withdraw`、`executeStrategy` 共享重入锁。

### 4.2 用户提款（减少账面余额 + 向用户转出 ETH）

**路径：** `DeFiPilotVault` → 用户 EOA

| 步骤 | 说明 |
|------|------|
| 1 | `withdraw(amount)`：校验 `ethBalance >= amount` |
| 2 | **先** `user.ethBalance -= amount`（checks-effects-interactions） |
| 3 | **后** `msg.sender.call{value: amount}("")` |
| 4 | 要求调用成功，否则 revert |

**要点：**

- 仅 **调用者本人** 可提走自己的账面余额；合约不暴露「代他人提款」接口。  
- 金库合约地址上实际持有的 ETH 总量应 **不少于** 所有用户 `ethBalance` 之和（正常运营下相等；若有人误转 ETH 到合约但不走 `deposit`，可能造成「合约余额 > 记账总和」的会计差异，属边缘情况，见 5.4）。

### 4.3 一键存入并执行（Direct 模式：depositAndExecute）

**路径：** 用户 EOA → `DeFiPilotVault.depositAndExecute(adapter)` → `AaveV3Adapter.depositETH` → `WrappedTokenGateway.depositETH` → `Aave Pool`

这是当前 **主要的用户操作入口**，一笔交易完成「存入 ETH + 投放到 DeFi 协议」。

调用链：

1. 用户通过前端点击「一键执行」，前端调用 `depositAndExecute(adapterAddress)` 并附带 `msg.value`。
2. Vault 内逻辑：
   - 校验 `msg.value > 0`、`whitelistedProtocols[protocol]`；
   - 调用 `IAaveV3Adapter(protocol).aWETH()` 获取 aToken 地址；
   - 记录 Vault 当前 aWETH 余额（`balanceBefore`）；
   - 调用 `IAaveV3Adapter(protocol).depositETH{value: msg.value}(address(this))`；
   - 计算 aWETH 增量 `received = balanceAfter - balanceBefore`；
   - 写入 `Position`（记录 protocol、amount、receivedToken、receivedAmount）；
   - 发出 `StrategyExecuted` 事件。
3. Adapter 内逻辑：
   - `depositETH` 校验 `msg.sender == vault`（onlyVault）；
   - 调用 `gateway.depositETH{value: msg.value}(pool, onBehalfOf, 0)`；
   - Gateway 将 ETH 包装为 WETH → 供应到 Aave Pool → Pool 铸造 aWETH 到 `onBehalfOf`（即 Vault 地址）。

**资金流：**

```
用户钱包 ──(1 ETH)──► Vault ──(1 ETH)──► Adapter ──(1 ETH)──► Gateway ──(WETH)──► Aave Pool
                                                                                      │
                                                                              (铸造 1 aWETH)
                                                                                      │
                                                                                      ▼
                                                                                  Vault 持有
                                                                                  1 aWETH
```

**Gas 消耗：** 约 400,000-450,000 gas（包含 Gateway 包装、Pool supply、aWETH mint）。

### 4.4 从协议赎回（withdrawFromProtocol）

**路径：** 用户 EOA → `DeFiPilotVault.withdrawFromProtocol(positionId)` → `AaveV3Adapter.withdrawETH` → `WrappedTokenGateway.withdrawETH` → ETH 返回 Vault

调用链：

1. 用户在前端 ACTIVE POSITIONS 卡片上点击「从 Aave V3 赎回」。
2. Vault 内逻辑：
   - 校验 `pos.active == true`、`pos.receivedToken != address(0)`；
   - 读取 Vault 当前 aWETH 余额，按比例计算该用户可赎回的 aWETH 数量（含利息分配）；
   - 将 aWETH 转给 Adapter（`safeTransfer`）；
   - 调用 `adapter.withdrawETH(redeemAmount, address(this))`；
   - 记录 Vault 收到的 ETH 增量，计入用户 `ethBalance`；
   - 标记 Position 为 `active = false`。
3. Adapter 内逻辑：
   - `withdrawETH` 校验 `msg.sender == vault`；
   - 授权 Gateway 使用 aWETH（`aWETH.approve(gateway, amount)`）；
   - 调用 `gateway.withdrawETH(pool, amount, to)` → Gateway 从 Pool 取回 WETH → 解包为 ETH → 发送到 `to`（Vault）。

**资金流：**

```
Vault ──(aWETH)──► Adapter ──(approve aWETH)──► Gateway ──(从 Pool 取回)──► ETH
                                                                              │
                                                                    (ETH 返回 Vault)
                                                                              │
                                                                              ▼
                                                                    用户 ethBalance 增加
                                                                    （可再调用 withdraw 提取到钱包）
```

**Gas 消耗：** 约 350,000-400,000 gas。

### 4.5 Solver 批量执行（Solver 模式：executeStrategy）

**路径：** Solver（经 Executor）→ `DeFiPilotVault` → **白名单** `protocol` 合约

调用链：

1. **Solver**（或 Owner）调用 `IntentExecutor.executeBatch(user, intents[])`。  
2. 对每条 `Intent`，Executor 调用 `vault.executeStrategy(user, protocol, amount, data)`。  
3. Vault 内逻辑：  
   - 校验 `whitelistedProtocols[protocol]`；  
   - 校验 `_users[user].ethBalance >= amount`；  
   - `userInfo.ethBalance -= amount`；  
   - 若 protocol 实现了 `aWETH()` 接口，追踪 aToken 回流（用于后续 `withdrawFromProtocol` 赎回）；
   - `(bool success,) = protocol.call{value: amount}(data)`，`success` 必须为 true；  
   - 写入 `Position` 并发出 `StrategyExecuted`。

**前提条件：**

- 用户必须先通过 4.1 使 `_users[user].ethBalance` 有足够余额；否则 `executeStrategy` 因 `Insufficient balance` 失败。  
- **当前实现不要求** 用户对 `executeBatch` 再签一笔「授权」交易；链上信任模型见 **第 5 节**。

### 4.6 批量执行的原子性

- `executeBatch` 循环调用 `executeStrategy`；任一步 revert，**整笔交易回滚**。  
- 因此同一批次内的多条意图要么全部成功，要么全部不生效（含余额扣减与外部调用）。

### 4.7 数据流（非资金流）补充

- **事件**：`Deposited`、`Withdrawn`、`StrategyExecuted`、`ProtocolWhitelisted`、`IntentExecutorUpdated` 等可供索引器/前端展示。  
- **只读接口**：`getUserBalance`、`getUserPositionCount`、`getUserPosition` 用于前端或链下服务查询。

---

## 5. 安全设计

### 5.1 已实现的安全机制

| 机制 | 位置 | 作用 |
|------|------|------|
| **ReentrancyGuard** | `deposit`、`withdraw`、`executeStrategy` | 降低重入攻击面；配合先改状态再转账的提款顺序。 |
| **协议白名单** | `whitelistedProtocols` + `executeStrategy` 内校验 | 限制资金只能 `call` 到 Owner 明确允许的合约地址。 |
| **Executor 白名单（地址级）** | `intentExecutor` + `onlyExecutor` | 仅登记的 Executor（及 Owner，见下）可触发策略执行。 |
| **Solver 白名单** | `IntentExecutor.solvers` + `onlySolver` | 仅授权 Solver（及 Owner）可调用 `executeBatch`。 |
| **OpenZeppelin Ownable** | Vault / Executor | 管理权限（设置 Executor、白名单协议、Solver、Vault 指针）。 |

### 5.2 信任假设与中心化风险（必读）

以下行为在 **当前代码** 下是允许的，属于 **明确的信任模型**，而非「用户每笔策略都链上签名」的模型：

1. **Solver / Owner 可指定任意 `user` 参数**  
   - `executeBatch(user, intents)` 中的 `user` 由调用方传入。  
   - 若该 `user` 在金库中有余额，且协议在白名单内，**无需该用户再签交易** 即可从其账面余额扣款并执行外部调用。  
   - **含义**：用户将资金存入 Vault，即信任 **Owner 配置的 Solver** 不会恶意盗用其余额；这接近「托管 + 授权操作者」模型。  
   - **缓解方向（未在仓库中实现）**：链下用户签名（EIP-712）授权某次 `user`+`intents` 哈希、链上 `executeBatch` 校验签名；或用户自行调用仅本人可触发的包装合约。

2. **Owner 可调用 `executeStrategy`**  
   - `onlyExecutor` 允许 `msg.sender == owner()`。  
   - Owner 可直接对 Vault 调用 `executeStrategy`，效果与 Executor 路径类似（仍受白名单与余额约束）。  
   - **含义**：Owner 具备与用户资金动用相关的 **运营级权限**（在 Solver 之外）。

3. **白名单协议仍可能是恶意或存在漏洞的合约**  
   - 白名单只限制 **地址**，不验证 `data` 的安全性。  
   - 恶意或错误的 `data` 可能导致 ETH 被锁、被钓鱼合约转走等。  
   - **缓解**：严格审计目标协议；限制可调用函数选择集；最小权限 calldata 构建。

4. **`protocol.call{value: amount}(data)` 的通用风险**  
   - 目标合约若不存在或 revert，整笔失败；若存在设计缺陷，可能造成资产损失。  
   - 当前不处理「部分成功」或「外部协议异步退款」与 Vault 记账的自动对账。

### 5.3 提款与会计一致性

- 用户提款依赖 **账面余额**，Vault 必须有足够 ETH 余额支付。  
- 若 Vault 实际 ETH **低于** 所有用户 `ethBalance` 之和（例如被 Owner 误操作转走、或其它未建模路径），将导致部分用户无法提款——属于 **运维与合约不变量** 问题。  
- **建议不变量**：`address(vault).balance >= sum(ethBalance)`（链下监控）；禁止非标准路径随意转出 Vault ETH。

### 5.4 误转 ETH

- 若第三方直接向 Vault 转账，会记入 **转账发起方** 的 `ethBalance`（通过 `receive` → `deposit`）。  
- 若通过无 `payable`  fallback 的路径导致行为异常，需单独审计；当前合约提供 `receive` 与 `deposit`。

### 5.5 依赖库

- OpenZeppelin `Ownable`、`ReentrancyGuard`、`SafeERC20`（Vault 中 IERC20/SafeERC20 引入主要为扩展预留，**当前核心路径为原生 ETH**）。

---

## 6. 链下与前端

### 6.1 AI 驱动的策略生成

1. 用户在聊天面板描述投资意图（如"投 1 ETH 到 Aave"）。
2. 后端 `/api/chat` 将用户消息 + 链上状态（钱包余额、Vault 余额、持仓数）+ 协议上下文注入 AI 系统提示。
3. AI 返回自然语言解释 + JSON 策略块。
4. 后端 Encoder 将策略编码为可执行的交易参数（`depositAndExecute` 的 calldata）。
5. 前端收到 `txParams`（包含 to、data、value、mode），用户点击「一键执行」直接签名发送。

### 6.2 前端金库交互（已实现且经过验证）

- `useExecuteStrategy`：直接调用 `Vault.depositAndExecute(adapter)` 或 `Vault.deposit()`，一笔交易完成存入+投放。
- `useWithdraw`：
  - `withdrawFromVault(amount)`：从 Vault 余额提取 ETH 到钱包。
  - `withdrawFromProtocol(positionId)`：从 DeFi 协议赎回 aToken → ETH → Vault 余额。
- `useChat`：管理 AI 对话、策略解析、txParams 传递。
- 合约地址按链 ID 配置于 `frontend/src/utils/contracts.ts`（由部署脚本自动写入）。

### 6.3 持仓展示

- 前端每 30 秒调用 `/api/portfolio` 从链上读取真实数据。
- Vault 余额 > 0 时显示 Vault 持仓卡片（含提取按钮）。
- 协议持仓通过 `getUserPositionCount` + `getUserPosition` 读取，显示协议名、金额、APY、风险等级（含赎回按钮）。

---

## 7. 部署与运维要点

- 部署脚本：`contracts/scripts/deploy.ts`  
  - 部署 `DeFiPilotVault` → 部署 `IntentExecutor(vault)` → `vault.setIntentExecutor(executor)` → `executor.setSolver(deployer, true)`。  
- 环境变量：`contracts/.env` 中 `PRIVATE_KEY`、RPC（见 `.env.example`）。  
- **上线前检查清单建议**：  
  - 确认 `intentExecutor` 指向预期合约；  
  - 仅添加已审计协议至白名单；  
  - 明确 Solver 名单与密钥管理；  
  - 监控 Vault ETH 余额与用户总账面余额。

---

## 8. 测试与验证

- 测试文件：`contracts/test/DeFiPilotVault.test.ts`  
- 覆盖：存款、提款、超额提款拒绝、`receive` 存款、Owner 权限、Solver 权限、`executeBatch` 非 Solver 拒绝。  
- 运行：`cd contracts && npx hardhat test`

---

## 9. 术语表

| 术语 | 含义 |
|------|------|
| Vault / 金库 | `DeFiPilotVault` 合约 |
| Solver | 被允许调用 `executeBatch` 的地址，通常为链下服务 EOA 或合约 |
| 白名单协议 | `whitelistedProtocols[protocol] == true` 的合约 |
| 账面余额 | `_users[user].ethBalance`，与链上 Vault 持有的 ETH 应对应 |

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-19 | 初版：与当前仓库合约及前端 hook 行为对齐 |
