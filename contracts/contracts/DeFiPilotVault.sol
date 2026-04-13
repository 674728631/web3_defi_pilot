// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAaveV3.sol";

/**
 * @title DeFiPilotVault
 * @notice DeFi Pilot 核心资金金库合约（UUPS 可升级）
 * @dev 支持两种资金流转模式：
 *      1. 托管模式：用户 deposit → Solver 通过 executeStrategy 调配
 *      2. 直接模式：用户 depositAndExecute 一笔交易完成存入+执行（如 Aave 存款）
 *
 *      aToken 回流追踪：depositAndExecute 自动记录协议返回的 aToken 数量，
 *      用户可通过 withdrawFromProtocol 赎回 aToken 换回 ETH。
 *
 *      ReentrancyGuardTransient 使用 EIP-1153 transient storage，
 *      不占代理存储槽，要求目标链支持 Cancun EVM。
 */
contract DeFiPilotVault is Initializable, OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardTransient, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice 用户在外部协议中的持仓记录
    struct Position {
        address protocol;        // 目标协议（Adapter）地址
        address asset;           // 投入资产地址（ETH 为 address(0)）
        uint256 amount;          // 投入金额（wei）
        address receivedToken;   // 收到的 aToken/receipt token 地址
        uint256 receivedAmount;  // 收到的 aToken 数量（初始快照，实际余额可能因利息增长）
        uint256 timestamp;       // 创建时间戳
        bool active;             // 是否仍然活跃
    }

    /// @notice 用户在金库中的完整信息
    struct UserInfo {
        uint256 ethBalance;                      // 用户可用 ETH 余额
        uint256 positionCount;                   // 累计持仓数量（同时作为下一个持仓 ID）
        mapping(uint256 => Position) positions;  // positionId => Position
    }

    /// @dev 用户地址 => 用户信息
    mapping(address => UserInfo) private _users;

    /// @notice 经 owner 审核通过的可交互协议白名单
    mapping(address => bool) public whitelistedProtocols;

    /// @notice 被授权执行策略的 IntentExecutor 合约地址
    address public intentExecutor;

    /// @notice 所有用户 ethBalance 的总和，用于健康度监控
    uint256 public totalEthBalance;

    /// @notice 各 token 在所有 active position 中的 receivedAmount 总和（用于比例赎回计算）
    mapping(address => uint256) public totalActiveReceived;

    /// @notice 协议级函数选择器白名单：allowedSelectors[protocol][selector] = true
    /// @dev 仅在 selectorCheckEnabled=true 时，executeStrategy 会校验 data 前 4 字节
    mapping(address => mapping(bytes4 => bool)) public allowedSelectors;

    /// @notice 是否启用 calldata selector 校验（默认 false，向后兼容）
    bool public selectorCheckEnabled;

    /// @notice 用户通过 `deposit()` 成功存入 ETH 后发出；表示托管模式下该用户账面 ETH 余额已增加。
    event Deposited(address indexed user, uint256 amount);
    /// @notice 用户通过 `withdraw()` 成功提取 ETH 后发出；表示相应金额已从账面扣减并完成链上转账。
    event Withdrawn(address indexed user, uint256 amount);
    /// @notice 策略执行路径成功完成资金划转后发出（`executeStrategy` 或 `depositAndExecute`）；表示用户资金已按给定金额与目标协议完成交互。
    event StrategyExecuted(address indexed user, address protocol, uint256 amount, uint256 positionId);
    /// @notice 用户通过 `withdrawFromProtocol()` 关闭指定持仓并将赎回所得 ETH 记入账面后发出；`ethReceived` 为本次实际计入余额的 ETH 数量。
    event PositionClosed(address indexed user, uint256 positionId, uint256 ethReceived);
    /// @notice 管理员更新某协议（Adapter）白名单状态后发出；`status` 为 true 表示允许交互，false 表示禁止。
    event ProtocolWhitelisted(address protocol, bool status);
    /// @notice 管理员更新某协议下允许的 calldata 函数选择器后发出；与 `selectorCheckEnabled` 配合用于限制 `executeStrategy` 可调用的接口。
    event SelectorAllowed(address indexed protocol, bytes4 selector, bool status);
    /// @notice 管理员开启或关闭 calldata 选择器全局校验后发出；影响 `executeStrategy` 是否校验 `data` 前 4 字节。
    event SelectorCheckToggled(bool enabled);
    /// @notice 管理员设置新的 `intentExecutor` 地址后发出；新地址（及 owner）可调用 `executeStrategy`。
    event IntentExecutorUpdated(address executor);
    /// @notice 管理员通过 `rescueETH` 将合约中「实际余额减用户总账面」的盈余 ETH 转出后发出；用于回收误转资金，不影响 `totalEthBalance` 记账。
    event ETHRescued(address indexed to, uint256 amount);

    /// @dev 限制仅 IntentExecutor 或 owner 可调用
    modifier onlyExecutor() {
        require(msg.sender == intentExecutor || msg.sender == owner(), "Not authorized");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 代理部署后的首次初始化：初始化 OpenZeppelin `Ownable` 与 `Pausable` 模块，并将调用者设为合约 owner。
     * @dev 实现合约通过 UUPS 代理对外暴露时，仅能调用一次（`initializer` 修饰符保证）。
     */
    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
    }

    /// @notice UUPS 升级授权钩子：仅 owner 可批准将代理指向新的实现合约地址。
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice 接收 ETH（不自动 deposit，避免 Aave 赎回 ETH 回流时误记账）
    receive() external payable {}

    /**
     * @notice 存入 ETH 到金库（托管模式）
     */
    function deposit() public payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Zero deposit");
        _users[msg.sender].ethBalance += msg.value;
        totalEthBalance += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice 从金库提取 ETH
     * @param amount 提取金额（单位 wei）
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        UserInfo storage user = _users[msg.sender];
        require(user.ethBalance >= amount, "Insufficient balance");
        user.ethBalance -= amount;
        totalEthBalance -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice 执行 DeFi 策略（Solver/Executor 路径）
     * @dev 从用户 ethBalance 扣款并转发到白名单协议。
     *      自动检测协议是否实现 IProtocolAdapter 接口（aWETH()），
     *      若是则追踪 aToken 回流用于后续 withdrawFromProtocol 赎回。
     */
    function executeStrategy(
        address user,
        address protocol,
        uint256 amount,
        bytes calldata data
    ) external onlyExecutor nonReentrant whenNotPaused {
        // ① 校验协议白名单 & calldata 合法性
        require(whitelistedProtocols[protocol], "Protocol not whitelisted");
        require(data.length >= 4, "Invalid calldata");

        if (selectorCheckEnabled) {
            bytes4 selector = bytes4(data[:4]);
            require(allowedSelectors[protocol][selector], "Selector not allowed");
        }

        // ② 从用户账面余额中扣款
        UserInfo storage userInfo = _users[user];
        require(userInfo.ethBalance >= amount, "Insufficient balance");

        userInfo.ethBalance -= amount;
        totalEthBalance -= amount;

        // ③ 探测目标协议是否为 Aave 类 Adapter（实现 aWETH()），若是则快照 aToken 余额
        address rToken;
        uint256 rAmount;
        uint256 balBefore;

        if (protocol.code.length > 0) {
            try IProtocolAdapter(protocol).aWETH() returns (address aToken) {
                rToken = aToken;
                balBefore = IERC20(aToken).balanceOf(address(this));
            } catch {}
        }

        // ④ 将 ETH 连同 calldata 转发到目标协议执行策略
        (bool success, ) = protocol.call{value: amount}(data);
        require(success, "Strategy execution failed");

        // ⑤ 计算 aToken 实际回流量（余额差值），更新全局追踪
        if (rToken != address(0)) {
            rAmount = IERC20(rToken).balanceOf(address(this)) - balBefore;
            if (rAmount > 0) {
                totalActiveReceived[rToken] += rAmount;
            }
        }

        // ⑥ 创建持仓记录，保存协议、金额、aToken 快照等信息
        uint256 posId = userInfo.positionCount++;
        userInfo.positions[posId] = Position({
            protocol: protocol,
            asset: address(0),
            amount: amount,
            receivedToken: rToken,
            receivedAmount: rAmount,
            timestamp: block.timestamp,
            active: true
        });

        emit StrategyExecuted(user, protocol, amount, posId);
    }

    /**
     * @notice 一笔交易完成「存入 ETH + 执行策略 + 记录 aToken 回流」
     * @param protocol 白名单 Adapter 地址（需实现 IProtocolAdapter）
     * @dev ETH 不经过 ethBalance 中间状态，直接转发给 Adapter。
     *      合约自动构造 calldata 强制 onBehalfOf = address(this)，
     *      防止用户篡改 aToken 接收地址。
     *      通过快照 aToken 余额差计算实际回流量并记录到 Position。
     */
    function depositAndExecute(
        address protocol
    ) external payable nonReentrant whenNotPaused {
        // ① 前置校验：金额 > 0 且协议在白名单内
        require(msg.value > 0, "Zero value");
        require(whitelistedProtocols[protocol], "Not whitelisted");

        // ② 快照当前 aToken 余额，用于后续计算实际回流量
        address aToken = IProtocolAdapter(protocol).aWETH();    // 获取 receipt token 地址
        uint256 before = IERC20(aToken).balanceOf(address(this));   // 记录存入前的数量

        // ③ ETH 直接转发给 Adapter，强制 onBehalfOf = address(this) 防止篡改接收地址
        IProtocolAdapter(protocol).depositETH{value: msg.value}(address(this));

        // ④ 通过余额差值计算 Adapter 实际铸造给 Vault 的 aToken 数量
        uint256 received = IERC20(aToken).balanceOf(address(this)) - before;

        // ⑤ 创建持仓记录并更新全局 aToken 追踪量
        uint256 posId = _users[msg.sender].positionCount++;
        _users[msg.sender].positions[posId] = Position({
            protocol: protocol,
            asset: address(0),
            amount: msg.value,
            receivedToken: aToken,
            receivedAmount: received,
            timestamp: block.timestamp,
            active: true
        });

        totalActiveReceived[aToken] += received;

        emit StrategyExecuted(msg.sender, protocol, msg.value, posId);
    }

    /**
     * @notice 赎回指定持仓：按比例赎回 aToken（含利息份额）→ Adapter → ETH → 记入用户 ethBalance
     * @param positionId 待赎回的持仓 ID
     * @dev aToken 是 rebasing token，余额随时间增长。
     *      使用 totalActiveReceived 追踪各 token 的活跃份额总和，
     *      赎回量 = pos.receivedAmount / totalActiveReceived * currentBalance，
     *      确保多持仓场景下利息按初始存入比例公平分配，不存在先到先得问题。
     *      最后一笔持仓赎回时自动拿走剩余全部余额（避免粉尘残留）。
     */
    function withdrawFromProtocol(uint256 positionId) external nonReentrant whenNotPaused {
        // ① 校验持仓有效性：必须活跃且持有 receipt token
        Position storage pos = _users[msg.sender].positions[positionId];
        require(pos.active, "Not active");
        require(pos.receivedToken != address(0), "No received token");

        uint256 currentBalance = IERC20(pos.receivedToken).balanceOf(address(this));
        require(currentBalance > 0, "No tokens to redeem");

        // ② 按比例计算赎回量：用户份额 / 全局活跃份额 × 当前余额（含利息增长）
        //    最后一笔持仓赎回时 tracked <= receivedAmount，直接拿走全部余额避免粉尘残留
        uint256 tracked = totalActiveReceived[pos.receivedToken];
        uint256 redeemAmount;

        if (tracked <= pos.receivedAmount) {
            redeemAmount = currentBalance;
        } else {
            redeemAmount = pos.receivedAmount * currentBalance / tracked;
            if (redeemAmount > currentBalance) redeemAmount = currentBalance;
        }

        require(redeemAmount > 0, "Nothing to redeem");

        // ③ 从全局追踪中扣除该持仓的初始份额
        totalActiveReceived[pos.receivedToken] -= pos.receivedAmount;

        // ④ 将按比例计算的 aToken 转给 Adapter，然后调用 withdrawETH 赎回为原生 ETH
        IERC20(pos.receivedToken).safeTransfer(pos.protocol, redeemAmount);

        uint256 ethBefore = address(this).balance;

        (bool ok, ) = pos.protocol.call(
            abi.encodeWithSignature("withdrawETH(uint256,address)", redeemAmount, address(this))
        );
        require(ok, "Withdraw failed");

        // ⑤ 计算实际收到的 ETH，记入用户可提取余额，标记持仓关闭
        uint256 ethReceived = address(this).balance - ethBefore;

        _users[msg.sender].ethBalance += ethReceived;
        totalEthBalance += ethReceived;
        pos.active = false;

        emit PositionClosed(msg.sender, positionId, ethReceived);
    }

    // ─── Admin ───────────────────────────────────────────

    /// @notice 设置被授权调用 `executeStrategy` 的 IntentExecutor 合约地址；owner 仍可调用。传入零地址将 revert。
    function setIntentExecutor(address executor) external onlyOwner {
        require(executor != address(0), "Zero address");
        intentExecutor = executor;
        emit IntentExecutorUpdated(executor);
    }

    /// @notice 将指定协议（通常为 Adapter）加入或移出白名单；仅白名单协议可在 `executeStrategy` / `depositAndExecute` 中与金库交互。
    function whitelistProtocol(address protocol, bool status) external onlyOwner {
        whitelistedProtocols[protocol] = status;
        emit ProtocolWhitelisted(protocol, status);
    }

    /// @notice 设置协议允许的函数选择器
    /// @param protocol Adapter/协议地址
    /// @param selector 4 字节函数选择器（如 bytes4(keccak256("depositETH(address)"))）
    /// @param status true=允许 false=禁止
    function setAllowedSelector(address protocol, bytes4 selector, bool status) external onlyOwner {
        allowedSelectors[protocol][selector] = status;
        emit SelectorAllowed(protocol, selector, status);
    }

    /// @notice 批量设置协议允许的函数选择器
    function setAllowedSelectors(address protocol, bytes4[] calldata selectors, bool status) external onlyOwner {
        for (uint256 i = 0; i < selectors.length; i++) {
            allowedSelectors[protocol][selectors[i]] = status;
            emit SelectorAllowed(protocol, selectors[i], status);
        }
    }

    /// @notice 启用/禁用 calldata selector 校验
    function setSelectorCheckEnabled(bool enabled) external onlyOwner {
        selectorCheckEnabled = enabled;
        emit SelectorCheckToggled(enabled);
    }

    /// @notice 紧急暂停所有用户操作
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice 恢复合约操作
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice 恢复误发到合约中的无主 ETH（不影响用户账面余额）
    /// @param to 接收 ETH 的地址
    /// @param amount 恢复金额（不得超过 actualBalance - totalAccounted）
    function rescueETH(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        // 仅可取出 实际余额 - 用户总账面 的盈余部分，保护用户资金
        uint256 surplus = address(this).balance - totalEthBalance;
        require(amount <= surplus, "Exceeds surplus");
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit ETHRescued(to, amount);
    }

    // ─── View ────────────────────────────────────────────

    /// @notice 查询指定用户在金库中的可用 ETH 账面余额（单位 wei），对应 `UserInfo.ethBalance`。
    function getUserBalance(address user) external view returns (uint256) {
        return _users[user].ethBalance;
    }

    /// @notice 查询指定用户已创建的持仓总数（含已关闭），数值等于下一个将分配的 `positionId`。
    function getUserPositionCount(address user) external view returns (uint256) {
        return _users[user].positionCount;
    }

    /// @notice 返回指定用户某个 `positionId` 对应的 `Position` 结构体快照（链上只读视图）。
    function getUserPosition(address user, uint256 posId) external view returns (Position memory) {
        return _users[user].positions[posId];
    }

    /**
     * @notice 健康度查询：对比合约实际 ETH 余额与用户总账面余额
     * @return actualBalance  合约持有的 ETH
     * @return totalAccounted 所有用户 ethBalance 之和
     * @return healthy        actualBalance >= totalAccounted
     */
    function getHealthFactor() external view returns (
        uint256 actualBalance,
        uint256 totalAccounted,
        bool healthy
    ) {
        actualBalance = address(this).balance;
        totalAccounted = totalEthBalance;
        healthy = actualBalance >= totalAccounted;
    }
}
