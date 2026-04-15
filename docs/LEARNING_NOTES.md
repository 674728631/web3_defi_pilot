# DeFi Pilot 合约学习笔记

> 整理自开发过程中的技术问答，涵盖 Solidity 语言特性、UUPS 代理模式、EVM 机制、合约安全等核心知识点。

---

## 目录

- [1. UUPS 代理模式](#1-uups-代理模式)
  - [1.1 constructor 与 _disableInitializers](#11-constructor-与-_disableinitializers)
  - [1.2 initialize 与 __Pausable_init()](#12-initialize-与-__pausable_init)
  - [1.3 代理合约 vs 实现合约](#13-代理合约-vs-实现合约)
  - [1.4 合约升级与重新部署](#14-合约升级与重新部署)
- [2. Solidity 语言特性](#2-solidity-语言特性)
  - [2.1 receive() 函数](#21-receive-函数)
  - [2.2 storage vs memory](#22-storage-vs-memory)
  - [2.3 interface 与 is 关键字](#23-interface-与-is-关键字)
  - [2.4 public 变量的自动 getter](#24-public-变量的自动-getter)
  - [2.5 override 关键字](#25-override-关键字)
  - [2.6 calldata 与函数选择器（selector）](#26-calldata-与函数选择器selector)
- [3. 合约架构与角色](#3-合约架构与角色)
  - [3.1 Solver 角色](#31-solver-角色)
  - [3.2 执行路径 A（无签名）vs 路径 B（EIP-712 签名）](#32-执行路径-a无签名vs-路径-beip-712-签名)
  - [3.3 depositAndExecute vs deposit + executeStrategy](#33-depositandexecute-vs-deposit--executestrategy)
  - [3.4 receipt token（aToken）](#34-receipt-tokenatoken)
  - [3.5 positionId 的获取](#35-positionid-的获取)
- [4. 合约安全](#4-合约安全)
  - [4.1 Solver 的权限边界](#41-solver-的权限边界)
  - [4.2 data.length 校验](#42-datalength-校验)
  - [4.3 rescueETH 安全设计](#43-rescueeth-安全设计)
- [5. EVM 机制](#5-evm-机制)
  - [5.1 CREATE vs CREATE2](#51-create-vs-create2)
  - [5.2 反事实部署（Counterfactual Deployment）](#52-反事实部署counterfactual-deployment)
  - [5.3 合约工厂（Contract Factory）](#53-合约工厂contract-factory)
- [6. 重命名与重构](#6-重命名与重构)
  - [6.1 IAaveV3Adapter → IProtocolAdapter](#61-iaavev3adapter--iprotocoladapter)
- [7. 更多 Solidity 特性](#7-更多-solidity-特性)
  - [7.1 address.code —— 判断地址是否为合约](#71-addresscode--判断地址是否为合约)
  - [7.2 try/catch —— 外部调用错误捕获](#72-trycatch--外部调用错误捕获)
  - [7.3 safeTransfer —— 安全的 ERC-20 转账](#73-safetransfer--安全的-erc-20-转账)
  - [7.4 EVM 的串行执行模型](#74-evm-的串行执行模型)
  - [7.5 nonReentrant 与 ReentrancyGuardTransient](#75-nonreentrant-与-reentrancyguardtransient)
- [8. EIP-712 签名机制](#8-eip-712-签名机制)
  - [8.1 Domain Separator（域分隔符）](#81-domain-separator域分隔符)
  - [8.2 TYPEHASH（类型哈希）](#82-typehash类型哈希)
  - [8.3 完整签名链](#83-完整签名链)
  - [8.4 前端签名流程](#84-前端签名流程)
  - [8.5 读取 public 变量](#85-读取-public-变量)
- [9. keccak256 哈希函数](#9-keccak256-哈希函数)
  - [9.1 基本概念](#91-基本概念)
  - [9.2 在项目中的用途](#92-在项目中的用途)
  - [9.3 keccak256 vs SHA-256](#93-keccak256-vs-sha-256)
- [10. abi.encode 序列化](#10-abiencode-序列化)
  - [10.1 基本概念](#101-基本概念)
  - [10.2 abi.encode vs abi.encodePacked](#102-abiencode-vs-abiencodepacked)
  - [10.3 在 IntentExecutor 中的用法](#103-在-intentexecutor-中的用法)
  - [10.4 类比](#104-类比)
- [11. 本地定义接口 vs 引入第三方包](#11-本地定义接口-vs-引入第三方包)
  - [11.1 为什么用本地定义接口](#111-为什么用本地定义接口)
  - [11.2 本地定义的优势](#112-本地定义的优势)
  - [11.3 什么时候必须引入完整包](#113-什么时候必须引入完整包)
  - [11.4 行业实践](#114-行业实践)
  - [11.5 注意事项](#115-注意事项)
- [12. Uniswap V3 与 LP 机制](#12-uniswap-v3-与-lp-机制)
  - [12.1 头寸（Position）](#121-头寸position)
  - [12.2 无常损失（Impermanent Loss）](#122-无常损失impermanent-loss)
  - [12.3 Uniswap V3 集中流动性](#123-uniswap-v3-集中流动性)
  - [12.4 项目中的 UniswapV3Adapter 设计](#124-项目中的-uniswapv3adapter-设计)
- [13. DeFi / Web3 术语表](#13-defi--web3-术语表)
  - [13.1 基础概念](#131-基础概念)
  - [13.2 账户与合约](#132-账户与合约)
  - [13.3 代币相关](#133-代币相关)
  - [13.4 DeFi 核心概念](#134-defi-核心概念)
  - [13.5 DeFi 协议类型](#135-defi-协议类型)
  - [13.6 安全相关](#136-安全相关)
  - [13.7 Web3 基础设施](#137-web3-基础设施)

---

## 1. UUPS 代理模式

### 1.1 constructor 与 _disableInitializers

```solidity
constructor() {
    _disableInitializers();
}
```

**constructor 何时调用？** 在部署**实现合约**时自动执行一次。

**部署流程：**

```
deployer 调用 deployProxy()
  ├─ 1. 部署实现合约 → constructor() 执行 → _disableInitializers()
  ├─ 2. 部署代理合约 → 指向实现合约
  └─ 3. 通过代理调用 initialize()
```

**_disableInitializers 的作用：** 禁止任何人直接在实现合约上调用 `initialize()`。

**安全风险：**
- 正常路径：用户 → 代理合约 → delegatecall → 实现合约的 initialize()（写入代理的 storage）✅
- 攻击路径：攻击者 → 直接调用实现合约的 initialize() → 成为实现合约的 owner ❌

`_disableInitializers()` 将实现合约的初始化标志设为 `type(uint64).max`，使得 `initializer` 修饰符永远 revert。代理合约通过 delegatecall 读的是自己的 storage（`_initialized` 初始为 0），所以不受影响。

### 1.2 initialize 与 __Pausable_init()

`__Pausable_init()` 是一个空函数——`_paused` 默认就是 `false`，不需要初始化。

**为什么还要调用？**
1. **初始化链完整性**：如果未来 OpenZeppelin 升级版本在里面加了逻辑，你的合约不会出问题
2. **`onlyInitializing` 修饰符**：确保只能在 `initialize()` 上下文中调用

类比 Java 中调用 `super()`——即使父类构造函数是空的，也推荐显式调用。

### 1.3 代理合约 vs 实现合约

```
DeFiPilotVault.sol（源码） → 编译 → 链上两个合约实例：

  代理合约 (Proxy)          实现合约 (Implementation)
  0x55CAB33e...              0x某个地址...
  - 存储所有数据              - 只有代码逻辑
  - 用户交互的入口            - 没有用户数据
  - owner 记录在这里          - constructor 已锁死
```

`deployed-addresses.json` 中的地址是**代理合约**地址。用户永远只跟代理交互。

### 1.4 合约升级与重新部署

**不需要重新部署的修改：**
- 重命名 interface / contract / 变量
- 修改注释
- 只加 `is SomeInterface` 和 `override`（不改逻辑）

**需要重新部署的修改：**
- 修改函数内部逻辑（如添加 `require`）
- 修改函数签名
- 新增/删除函数
- 修改 storage 布局

升级时代理地址不变，只是实现合约地址更新：

```typescript
const Vault = await ethers.getContractFactory("DeFiPilotVault");
await upgrades.upgradeProxy("0x55CAB33e...", Vault);
```

---

## 2. Solidity 语言特性

### 2.1 receive() 函数

```solidity
receive() external payable {}
```

当向合约地址发送 ETH 且**没有 calldata** 时，EVM 自动执行 `receive()`。

**在 Vault 中为什么是空函数？** 避免 Adapter 赎回 ETH 回流时误记账。赎回流程中 Adapter 发回 ETH 时 `msg.sender` 是 Adapter 地址，不是用户地址，自动 deposit 会把钱记到错误账户。

### 2.2 storage vs memory

```solidity
Position storage pos = _users[msg.sender].positions[positionId];
pos.active = false;  // ✅ 直接修改链上数据

Position memory pos = _users[msg.sender].positions[positionId];
pos.active = false;  // ❌ 只改了内存副本，链上不变
```

| | storage | memory |
|---|---|---|
| 本质 | 指向链上存储的引用（指针） | 内存中的临时拷贝 |
| 修改效果 | 直接写入链上 | 函数结束后丢弃 |
| 适用场景 | 需要修改链上数据 | 只读、不需要修改 |

### 2.3 interface 与 is 关键字

Solidity 不强制要求用 `is` 声明接口实现。EVM 调用时只看 selector 是否匹配。

```solidity
// 写法 1：显式声明（推荐，编译时检查）
contract Adapter is IProtocolAdapter { ... }

// 写法 2：不声明，只实现函数（运行时兼容）
contract Adapter { ... }
```

`is` 的好处：漏实现会编译报错，接口改了编译器会提示。

类比：Go 语言的隐式接口 vs Java 的 `implements`。

### 2.4 public 变量的自动 getter

```solidity
IERC20 public aWETH;
// 编译器自动生成：
// function aWETH() external view returns (IERC20) { return aWETH; }
```

AaveV3Adapter 的 `aWETH` 变量通过自动 getter 隐式满足了 `IProtocolAdapter` 接口。但 Solidity 不允许用 `override` 修饰 public 变量来覆盖返回类型不完全匹配的接口函数。

### 2.5 override 关键字

当合约显式声明 `is SomeInterface` 时，实现接口函数必须加 `override`：

```solidity
contract Adapter is IProtocolAdapter {
    function aWETH() external view override returns (address) { ... }
}
```

### 2.6 calldata 与函数选择器（selector）

`data` 参数是编码后的函数调用：

```
┌────────────────┬──────────────────────────┐
│ 前 4 字节       │ 后续 32 字节              │
│ 函数选择器      │ 参数                      │
│ 0x2d2da806     │ onBehalfOf = vault 地址   │
│ depositETH     │                          │
└────────────────┴──────────────────────────┘
```

`protocol.call{value: amount}(data)` = "给 protocol 发 amount ETH，调用 data 中指定的函数"。

selector = `keccak256("functionName(paramType1,paramType2)")` 的前 4 字节。跟 interface 名字无关，只跟函数签名有关。

---

## 3. 合约架构与角色

### 3.1 Solver 角色

Solver 是后台服务（Go 后端），拥有专用私钥，负责将 AI 生成的策略提交到链上。

```
用户 → 前端 → 后端 AI → 生成策略
                          ↓
                     Solver 机器人
                          ↓
                     用私钥签名交易
                          ↓
                 IntentExecutor.executeBatch()
                          ↓
                 DeFiPilotVault.executeStrategy()
```

类比：
- 用户 = 客户
- AI = 投资顾问
- Solver = 交易员
- IntentExecutor = 风控系统
- Vault = 保险箱

### 3.2 执行路径 A（无签名）vs 路径 B（EIP-712 签名）

由 `signatureRequired` 开关决定：

| | 路径 A | 路径 B |
|---|---|---|
| 调用函数 | `executeBatch` | `executeBatchWithSig` |
| 需要用户签名 | 否 | 是（EIP-712） |
| 安全等级 | 信任 Solver | 信任用户钱包 |
| 适用 | 开发/测试/演示 | 正式上线 |

Solver 私钥泄露后：
- 路径 A：攻击者可操作用户在 Vault 中的资金
- 路径 B：无影响，没有用户签名无法执行

### 3.3 depositAndExecute vs deposit + executeStrategy

| | 托管模式 | 直接模式 |
|---|---|---|
| 步骤 | deposit() + executeStrategy() | depositAndExecute() |
| 交易数 | 2 笔 | 1 笔 |
| 需要 Solver | 是 | 不需要 |
| 调用者 | Solver | 用户自己 |

### 3.4 receipt token（aToken）

存入 DeFi 协议后返回的"收据代币"：

| 协议 | 存入 | receipt token | `aWETH()` 返回 |
|---|---|---|---|
| Aave V3 | ETH | aWETH | aWETH 合约地址 |
| Compound V3 | ETH | Comet 份额 | Comet 地址 |
| Lido | ETH | stETH | stETH 地址 |
| Uniswap V3 | ETH | dpUNI3 | dpUNI3 地址 |

aToken 特性（以 Aave 为例）：数量随时间增长（生息），1:1 对应底层资产，赎回时销毁。

### 3.5 positionId 的获取

positionId 从 0 开始递增。前端获取方式：

1. **事件日志**：`StrategyExecuted` 事件包含 `positionId`
2. **View 函数**：`getUserPositionCount()` + `getUserPosition(user, i)` 遍历
3. **规律**：用户的 positionId 就是 0, 1, 2, 3...

---

## 4. 合约安全

### 4.1 Solver 的权限边界

**Solver 操作的是 Vault 中的余额，不是用户钱包。** 用户调用 `deposit()` 存入 ETH 就意味着信任合约规则。

Solver 的限制：
- 只能调用白名单协议
- 可选：只能调用白名单函数（selectorCheckEnabled）
- 不能超过用户余额
- 不能在暂停时操作
- 不能把 ETH 转到任意地址

### 4.2 data.length 校验

```solidity
require(data.length >= 4, "Invalid calldata");
```

**为什么需要？** 如果 `data` 为空（length=0）：
1. selector 检查被跳过
2. ETH 发到 Adapter 的 `receive()`
3. 没有调用 depositETH，没有铸造 aToken
4. ETH 卡在 Adapter 里，用户的钱"消失"

加上校验后，空 data 或畸形 data 无法通过。

### 4.3 rescueETH 安全设计

```solidity
uint256 surplus = address(this).balance - totalEthBalance;
require(amount <= surplus, "Exceeds surplus");
```

Owner 只能取出**不属于任何用户的多余 ETH**（误转、精度残留等），永远无法动用用户资金。

---

## 5. EVM 机制

### 5.1 CREATE vs CREATE2

**CREATE（默认）：**
```
地址 = keccak256(deployer_address, nonce)
```
每次 nonce 递增，地址不可预测。

**CREATE2：**
```
地址 = keccak256(0xff, deployer_address, salt, keccak256(bytecode))
```
相同参数 → 相同地址，可预测。但字节码变了地址也变。

### 5.2 反事实部署（Counterfactual Deployment）

先用 CREATE2 预计算合约地址，让用户向该地址转账（ETH 可以转给没有合约的地址），需要时再部署合约。

**以太坊地址的本质：** 20 字节的数字，不需要先有合约就能接收 ETH。就像邮政信箱——先注册号码，信可以寄，箱子之后再装。

**典型应用：** ERC-4337 账户抽象，智能钱包先给用户地址，用户充值，第一次操作时才部署合约。

### 5.3 合约工厂（Contract Factory）

专门用来创建其他合约的合约。用户调一个函数，工厂自动部署新合约。

```solidity
contract NFTFactory {
    function createCollection(string memory name) external returns (address) {
        NFTCollection c = new NFTCollection(name, msg.sender);
        return address(c);
    }
}
```

真实案例：
- Uniswap V3 Factory → 创建交易对池
- Safe ProxyFactory → 创建多签钱包
- ERC-4337 AccountFactory → 创建智能钱包

---

## 6. 重命名与重构

### 6.1 IAaveV3Adapter → IProtocolAdapter

将 Aave 专用接口名改为通用名（所有 Adapter 共用）。

**不需要重新部署**：interface 名只存在于源码级别，编译后只保留 selector。`IAaveV3Adapter.aWETH()` 和 `IProtocolAdapter.aWETH()` 生成相同的 selector。

类比：手机联系人改名不影响通话。

**AaveV3Adapter 特殊情况**：因为 `IERC20 public aWETH` 自动 getter 的返回类型（IERC20）与接口要求（address）不完全匹配，无法加 `is IProtocolAdapter`。其他 3 个 Adapter（Compound、Lido、Uniswap）已成功添加。

---

## 7. 更多 Solidity 特性

### 7.1 address.code —— 判断地址是否为合约

```solidity
if (protocol.code.length > 0) {
    // protocol 是合约地址
}
```

`address.code` 返回该地址的运行时字节码（`bytes`）。`length > 0` 表示有合约代码。

| `.code.length` | 含义 |
|---|---|
| `> 0` | 合约地址（CA） |
| `== 0` | 普通钱包（EOA）或尚未部署合约 |

底层使用 `EXTCODESIZE` 操作码，不会加载完整字节码，gas 开销很低。

相关属性：`addr.codehash` 返回字节码的 keccak256 哈希（固定 32 字节，更省 gas）。

### 7.2 try/catch —— 外部调用错误捕获

```solidity
try IProtocolAdapter(protocol).aWETH() returns (address aToken) {
    // 调用成功
} catch {
    // 调用失败，跳过
}
```

**语法结构：**

```solidity
try 外部调用 returns (返回类型 变量) {
    // 成功分支
} catch Error(string memory reason) {
    // require/revert 带消息
} catch (bytes memory lowLevelData) {
    // 其他失败
} catch {
    // 简写：捕获所有失败
}
```

**限制：** 只能用于**外部调用**和 `new Contract()`，不能用于内部函数。

**用途：** 探测合约是否实现某个接口（duck typing）。

### 7.3 safeTransfer —— 安全的 ERC-20 转账

```solidity
IERC20(token).safeTransfer(to, amount);
```

- `safeTransfer(to, amount)` 的发送方是**当前合约**（`address(this)`）
- 不同于 `safeTransferFrom(from, to, amount)` 需要指定发送方且需要 approve
- 来自 OpenZeppelin 的 `SafeERC20` 库，处理了不规范 ERC-20（如 USDT）不返回 bool 的问题

### 7.4 EVM 的串行执行模型

**以太坊没有并发。** 同一区块内的交易严格按顺序逐个执行：

```
区块 N:
  交易 1 → 完整执行 → 状态更新
  交易 2 → 完整执行 → 状态更新（读到的是交易 1 后的最新状态）
  交易 3 → 完整执行 → ...
```

因此"快照余额 → 操作 → 计算差值"的模式是安全的：

```solidity
uint256 before = address(this).balance;   // 快照
// ... 外部调用 ...                        // 不会被其他交易打断
uint256 received = address(this).balance - before;  // 差值精确
```

**唯一风险：同一笔交易内的重入攻击。** 用 `nonReentrant` 修饰符防护：

```solidity
function withdrawFromProtocol(...) external nonReentrant {
    // 进入后 lock = true，任何试图重入的调用都会 revert
}
```

### 7.5 nonReentrant 与 ReentrancyGuardTransient

```
传统 ReentrancyGuard：
  锁变量存在 storage 中，每次进出函数需要 SSTORE（~5000 gas）

ReentrancyGuardTransient（EIP-1153）：
  锁变量存在 transient storage 中，每次进出只需 TSTORE（~100 gas）
  transient storage 在交易结束后自动清空
```

DeFiPilotVault 使用 `ReentrancyGuardTransient`，gas 更省，且不占代理 storage 槽。

---

## 8. EIP-712 签名机制

### 8.1 Domain Separator（域分隔符）

```solidity
__EIP712_init("DeFiPilot", "1");
```

Domain Separator 是一个唯一标识签名上下文的哈希值：

```
domainSeparator = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    keccak256("DeFiPilot"),    // name：应用名称
    keccak256("1"),            // version：版本号
    block.chainid,             // chainId：链 ID（Sepolia = 11155111）
    address(this)              // verifyingContract：合约地址
)
```

**作用：** 防止签名被跨合约、跨链、跨版本重用。

### 8.2 TYPEHASH（类型哈希）

```solidity
bytes32 BATCH_TYPEHASH = keccak256(
    "ExecuteBatch(address user,bytes32 intentsHash,uint256 nonce,uint256 deadline)"
);
```

TYPEHASH 不是函数，是给"数据结构蓝图"打的唯一指纹。它是前端和合约之间的"契约"。

**abi.encode 必须严格匹配 TYPEHASH 中的参数顺序和类型：**

```
TYPEHASH:    ExecuteBatch(address user, bytes32 intentsHash, uint256 nonce, uint256 deadline)
                           ↕                ↕                  ↕                ↕
abi.encode:  BATCH_TYPEHASH, user,        intentsHash,     nonces[user]++,    deadline
```

如果顺序或类型不匹配 → structHash 不一致 → 签名验证失败。

### 8.3 完整签名链

```
① TYPEHASH = hash("ExecuteBatch(...)")              ← 模板指纹
② structHash = hash(TYPEHASH, user, ...)             ← 具体数据
③ domainSeparator = hash(name, version, chainId, contract) ← 上下文
④ digest = hash("\x19\x01" + domainSeparator + structHash) ← 最终摘要
⑤ signature = user.sign(digest)                      ← 用户签名（不花 gas）
⑥ ECDSA.recover(digest, signature) == user?           ← 合约验证
```

### 8.4 前端签名流程

```typescript
// 1. 定义 domain（与合约 __EIP712_init 一致）
const domain = {
    name: "DeFiPilot", version: "1",
    chainId: 11155111, verifyingContract: EXECUTOR_ADDRESS
};

// 2. 定义 types（与合约 TYPEHASH 完全一致）
const types = {
    ExecuteBatch: [
        { name: "user", type: "address" },
        { name: "intentsHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
    ]
};

// 3. MetaMask 弹出签名确认（用户看到结构化数据，不花 gas）
const signature = await signer.signTypedData(domain, types, value);

// 4. 签名发给后端 Solver
// 5. Solver 用自己的私钥发交易（Solver 付 gas）
await executor.executeBatchWithSig(user, intents, deadline, signature);
```

### 8.5 读取 public 变量

所有 `public` 状态变量都自动生成 getter 函数，前端可直接读取（view 调用，不消耗 gas）：

```typescript
const required = await intentExecutor.signatureRequired();  // bool
const nonce = await intentExecutor.nonces(userAddress);      // uint256
const isSolver = await intentExecutor.solvers(addr);         // bool
```

---

## 9. keccak256 哈希函数

### 9.1 基本概念

keccak256 是以太坊的核心哈希函数，将任意长度输入转为固定 32 字节输出。

| 特性 | 说明 |
|---|---|
| 确定性 | 同输入 → 同输出 |
| 单向性 | 无法从哈希反推输入 |
| 雪崩效应 | 改一个字 → 输出完全不同 |
| 抗碰撞 | 不同输入几乎不可能相同哈希 |
| 固定长度 | 输出永远 32 字节 |

### 9.2 在项目中的用途

| 用途 | 示例 |
|---|---|
| 函数选择器 | `bytes4(keccak256("depositETH(address)"))` → `0x2d2da806` |
| EIP-712 类型哈希 | `keccak256("ExecuteBatch(...)")` |
| 签名 digest | `keccak256(abi.encodePacked("\x19\x01", domain, struct))` |
| Storage 槽位 | `keccak256(key, slot)` → mapping 存储位置 |
| ERC-7201 命名空间 | `keccak256("openzeppelin.storage.Pausable")` |
| CREATE2 地址 | `keccak256(0xff, deployer, salt, keccak256(bytecode))` |

### 9.3 keccak256 vs SHA-256

keccak256 是 SHA-3 的原始版本（Keccak 家族），以太坊采用。SHA-256（SHA-2 家族）由比特币和 HTTPS 使用。两者输出格式相同（32 字节）但算法不同。

---

## 10. abi.encode 序列化

### 10.1 基本概念

`abi.encode` 把多个不同类型的值打包成一段连续的 `bytes`，每个值**填充到 32 字节**后拼接。

```solidity
// keccak256 只接受一个 bytes，所以先用 abi.encode 打包
keccak256(abi.encode(user, intentsHash, nonce, deadline))
```

编码示例：
```
abi.encode(address(0xABCD), uint256(42))
→ [32字节: 0x000...ABCD] [32字节: 0x000...002A]
→ 总共 64 字节
```

### 10.2 abi.encode vs abi.encodePacked

| | `abi.encode` | `abi.encodePacked` |
|---|---|---|
| 填充 | 每个值补到 32 字节 | 不补，原始大小紧凑拼接 |
| 无歧义 | ✅ 可反向解码 | ❌ 可能碰撞 |
| 用途 | EIP-712、合约间调用 | 固定长度值的紧凑哈希 |

**碰撞风险示例：**

```solidity
abi.encodePacked("ab", "c")  → 0x616263
abi.encodePacked("a", "bc") → 0x616263  // 相同！❌

abi.encode("ab", "c")  → 不同结果
abi.encode("a", "bc") → 不同结果  // 安全 ✅
```

`abi.encodePacked` 在所有元素都是固定长度（如 `bytes32`）时安全可用。

### 10.3 在 IntentExecutor 中的用法

```solidity
// abi.encode：EIP-712 structHash（需要无歧义）
keccak256(abi.encode(BATCH_TYPEHASH, user, intentsHash, nonce, deadline))

// abi.encodePacked：拼接多个 bytes32 哈希（固定长度，不会碰撞）
keccak256(abi.encodePacked(hashes))
```

### 10.4 类比

```
abi.encode     = Excel 表格：每列固定宽度，整齐排列
abi.encodePacked = 记事本：紧凑书写，无分隔符
keccak256      = 指纹机：给字节串生成 32 字节指纹
```

---

## 11. 本地定义接口 vs 引入第三方包

### 11.1 为什么用本地定义接口

项目中 `IAaveV3.sol`、`ICompoundV3.sol`、`IUniswapV3.sol` 等接口文件都是**本地手动定义**的精简接口，而非从 `@aave/aave-v3-periphery` 等第三方包引入。这是 DeFi 开发中的标准做法。

**核心原因：调用外部合约只需要函数签名，不需要实现代码。**

Solidity 外部调用的本质是通过**函数选择器（selector）** 路由的：

```solidity
// 只要函数签名（名称 + 参数类型）一致，selector 就相同
bytes4(keccak256("depositETH(address,address,uint16)"))  // → 0x474cf53d
// 无论定义在哪个 interface 里，这个 selector 都不变
```

因此，本地定义一个只包含所需函数的接口，与引入完整官方包相比，调用效果**完全等价**。

### 11.2 本地定义的优势

| 优势 | 说明 |
|---|---|
| **零外部依赖** | 不引入任何第三方包，不存在版本冲突风险 |
| **避免依赖地狱** | 官方包可能依赖特定版本的 OpenZeppelin 等库，与项目现有依赖冲突 |
| **编译更快** | 只编译 2-3 个函数签名，而非整个第三方仓库的数十个合约 |
| **合约更轻** | 最终部署的字节码不包含未使用的接口定义 |
| **版本解耦** | 第三方包升级不影响你的项目，只要链上合约的函数签名不变 |

### 11.3 什么时候必须引入完整包

| 场景 | 做法 | 原因 |
|---|---|---|
| **调用**别人的合约 | 本地定义接口 | 只需要 selector 匹配 |
| **继承**别人的合约 | 引入完整包 | 需要实现代码参与编译 |

项目中的例子：
- `@openzeppelin/contracts-upgradeable` → **必须引入**，因为合约需要继承 `ERC20Upgradeable`、`OwnableUpgradeable` 等的实现逻辑
- `IAaveV3.sol`（Aave Gateway/Pool） → **本地定义**，只是调用链上已部署的合约

### 11.4 行业实践

主流 DeFi 项目普遍采用本地精简接口：

| 项目 | 做法 |
|---|---|
| Yearn Vaults | 本地定义精简的 Aave/Compound 接口 |
| Lido | 本地定义 Uniswap Router 接口 |
| 1inch | 本地定义所有外部协议接口 |

### 11.5 注意事项

- 本地定义的函数签名（名称 + 参数类型 + 顺序）必须与链上合约**完全一致**，否则 selector 不匹配会导致调用失败
- 参数**命名**可以不同（如官方用 `onBehalfOf`，你用 `to`），不影响 ABI 兼容性
- 只需包含项目实际用到的函数，不必复制完整接口（如 Aave Gateway 有 5 个函数，项目只用 `depositETH` 和 `withdrawETH`）

---

## 12. Uniswap V3 与 LP 机制

### 12.1 头寸（Position）

**头寸**就是你在某个市场中持有的资产仓位——"你在某个地方放了多少钱"。

| 场景 | 头寸的含义 |
|---|---|
| 股票 | 你持有 100 股茅台 = 你有一个茅台头寸 |
| Aave | 你存了 1 ETH = 你有一个 1 ETH 的存款头寸 |
| Uniswap V3 | 你在 [3000, 4000] 价格区间提供了流动性 = 一个 LP 头寸 |

在项目中，Vault 的 `Position` 结构记录"用户在哪个协议存了多少钱"：

```solidity
struct Position {
    address protocol;   // 在哪（Aave/Compound/Lido/Uniswap）
    uint256 amount;     // 存了多少
    bool active;        // 是否还在
}
```

Uniswap V3 的头寸比较特殊——每个头寸是一个 **ERC-721 NFT**，因为每个人选的价格区间不同，不可互换。

### 12.2 无常损失（Impermanent Loss）

**本质：** 做 LP 时，如果代币价格变动，你的持仓会比"不做 LP 直接拿着"更亏。

**示例：** 在 ETH = 3000 USDC 时提供流动性，存入 1 ETH + 3000 USDC（总价值 6000 USDC）

当 ETH 涨到 4000 USDC 时：

| 策略 | 最终持有 | 总价值 |
|---|---|---|
| 不做 LP，自己拿着 | 1 ETH + 3000 USDC | **7000 USDC** |
| 做了 LP | ≈0.866 ETH + ≈3464 USDC | **6928 USDC** |
| 差值（无常损失） | | **-72 USDC** |

**原因：** ETH 涨价时，交易者不断往池子里放 USDC 换走 ETH。你的池子份额中 ETH 在减少、USDC 在增加——池子自动帮你在涨价时卖出了部分 ETH。

**为什么叫"无常"：** 如果价格**回到初始值**，损失就消失了。只有在价格偏离时赎回，损失才变成永久的。

**为什么还有人做 LP：** 因为 LP 能赚交易手续费。实际收益 = 手续费收入 - 无常损失。

### 12.3 Uniswap V3 集中流动性

**V2（全范围）：**
所有资金均匀分布在 0 → ∞ 的价格范围，大部分资金闲置。

**V3（集中流动性）：**
LP 自选价格区间（如 3000-4000），资金集中在该区间，手续费收益可达 V2 的数百倍。但价格超出区间后不再赚手续费。

LP 凭证从 V2 的 ERC-20 变为 V3 的 ERC-721 NFT（因为每个人的价格区间不同，不可互换）。

**tick 与价格的关系：** `price = 1.0001^tick`。tick = 0 → 价格 = 1，tick 越大价格越高。

### 12.4 项目中的 UniswapV3Adapter 设计

**采用全范围（Full Range）：** tickLower = -887220, tickUpper = 887220，等价于 V2 的行为。牺牲资金效率换取简单性。

**单边流动性提供：** 只存 WETH，不存配对代币。

**Receipt Token 解决方案：** Uni V3 LP 头寸是 NFT，无法被 Vault 用 `balanceOf` 追踪。Adapter 自己部署 `UniV3ReceiptToken`（dpUNI3）作为 ERC-20 收据代币，1:1 映射存入的 ETH 数量。

**存入流程：**
```
Vault 发 ETH → Adapter
  → weth.deposit()           // ETH → WETH
  → positionManager.mint()   // 铸造 LP NFT（Adapter 持有）
  → receiptToken.mint()      // 铸造 dpUNI3 给 Vault
```

**赎回流程：**
```
Vault 将 dpUNI3 转给 Adapter
  → receiptToken.burn()                // 销毁凭证
  → positionManager.decreaseLiquidity() // 移除流动性
  → positionManager.collect()           // 收取代币 + 手续费
  → weth.withdraw()                     // WETH → ETH
  → 发送 ETH 回 Vault
```

---

## 13. DeFi / Web3 术语表

### 13.1 基础概念

| 术语 | 英文 | 含义 |
|---|---|---|
| 钱包 | Wallet | 管理私钥的工具（如 MetaMask），用来签名交易 |
| 私钥 | Private Key | 控制你账户的唯一密码，谁有私钥谁拥有资产 |
| 助记词 | Mnemonic / Seed Phrase | 12/24 个单词，可以恢复私钥 |
| Gas | Gas | 执行交易需要支付的计算费用（用 ETH 支付） |
| Gas Fee | Gas Fee | Gas 价格 × Gas 用量 = 实际手续费 |
| 区块 | Block | 一批交易的打包记录，大约每 12 秒出一个（以太坊） |
| 共识 | Consensus | 网络中所有节点就"哪些交易有效"达成一致的机制 |
| PoS | Proof of Stake | 权益证明，验证者质押 ETH 来参与出块 |

### 13.2 账户与合约

| 术语 | 英文 | 含义 |
|---|---|---|
| EOA | Externally Owned Account | 普通钱包地址，由私钥控制 |
| CA | Contract Account | 合约地址，由代码控制 |
| 智能合约 | Smart Contract | 部署在链上的程序，自动执行预设逻辑 |
| ABI | Application Binary Interface | 合约的"说明书"，告诉前端怎么调用合约函数 |
| 代理合约 | Proxy Contract | 存储数据的壳，逻辑指向可升级的实现合约（项目用 UUPS） |

### 13.3 代币相关

| 术语 | 英文 | 含义 |
|---|---|---|
| ERC-20 | ERC-20 | 同质化代币标准（USDC、WETH、DAI 都是） |
| ERC-721 | ERC-721 | 非同质化代币标准（NFT），每个 token 独一无二 |
| ERC-1155 | ERC-1155 | 多代币标准，可同时包含同质化和非同质化 |
| WETH | Wrapped ETH | ETH 的 ERC-20 包装版，1:1 兑换 |
| 稳定币 | Stablecoin | 锚定美元的代币（USDC、USDT、DAI） |
| 铸造 | Mint | 创建新代币（从无到有） |
| 销毁 | Burn | 永久销毁代币（从有到无） |
| Approve | Approve | 授权某合约使用你的代币（"允许 Uniswap 花我的 USDC"） |

### 13.4 DeFi 核心概念

| 术语 | 英文 | 含义 |
|---|---|---|
| TVL | Total Value Locked | 锁定总价值，衡量一个协议有多少资产 |
| APY | Annual Percentage Yield | 年化收益率（含复利） |
| APR | Annual Percentage Rate | 年化利率（不含复利） |
| 流动性 | Liquidity | 可供交易的资金量，越多滑点越小 |
| 滑点 | Slippage | 交易执行价格与预期价格的偏差 |
| 无常损失 | Impermanent Loss | LP 因价格变动导致的资产缩水（详见 12.2） |
| 头寸 | Position | 在某个协议中持有的资产仓位（详见 12.1） |
| 清算 | Liquidation | 借款人抵押品价值不足时被强制卖出 |
| 抵押率 | Collateral Ratio | 抵押品价值 / 借款价值，低于阈值触发清算 |
| 闪电贷 | Flash Loan | 同一笔交易内借还的无抵押贷款，不还就整笔交易回滚 |

### 13.5 DeFi 协议类型

| 类型 | 代表项目 | 做什么 |
|---|---|---|
| 借贷 | Aave、Compound | 存钱赚利息 / 抵押借款 |
| DEX | Uniswap、Curve | 去中心化交易所，链上换币 |
| 流动性质押 | Lido、Rocket Pool | 质押 ETH 获得 stETH，可流通的 PoS 质押 |
| 聚合器 | 1inch、Paraswap | 比较多个 DEX 找最优价格 |
| 收益聚合 | Yearn、Beefy | 自动把资金投到收益最高的协议（本项目类似这个） |
| 衍生品 | GMX、dYdX | 链上做多/做空/杠杆交易 |
| 跨链桥 | LayerZero、Wormhole | 在不同链之间转移资产 |

### 13.6 安全相关

| 术语 | 英文 | 含义 |
|---|---|---|
| 重入攻击 | Reentrancy Attack | 在合约还没更新状态时反复调用它（项目用 `nonReentrant` 防护） |
| 三明治攻击 | Sandwich Attack | 在你的交易前后插入交易，利用价格变化获利 |
| Rug Pull | Rug Pull | 项目方卷款跑路 |
| 审计 | Audit | 第三方安全公司检查合约代码漏洞 |
| Bug Bounty | Bug Bounty | 悬赏找漏洞的奖励计划 |
| MEV | Maximal Extractable Value | 矿工/验证者通过排序交易获取的额外收益 |
| 前端攻击 | Frontrunning | 看到你的交易后抢先执行类似交易获利 |

### 13.7 Web3 基础设施

| 术语 | 英文 | 含义 |
|---|---|---|
| L1 | Layer 1 | 主链（以太坊、Solana、Avalanche） |
| L2 | Layer 2 | 扩容层（Arbitrum、Optimism、Base），更快更便宜 |
| RPC | Remote Procedure Call | 与区块链通信的接口（如 Infura、Alchemy 提供） |
| 预言机 | Oracle | 将链外数据（价格、天气等）喂给链上合约（Chainlink） |
| IPFS | InterPlanetary File System | 去中心化存储，常用来存 NFT 图片 |
| ENS | Ethereum Name Service | 以太坊域名服务（vitalik.eth） |
| DAO | Decentralized Autonomous Organization | 去中心化自治组织，用投票治理协议 |
| 治理代币 | Governance Token | 持有者可投票决定协议走向（如 UNI、AAVE） |

---

*最后更新：2026-04-14*
