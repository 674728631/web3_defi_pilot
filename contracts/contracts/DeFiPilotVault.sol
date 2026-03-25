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

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event StrategyExecuted(address indexed user, address protocol, uint256 amount);
    event PositionClosed(address indexed user, uint256 positionId, uint256 ethReceived);
    event ProtocolWhitelisted(address protocol, bool status);
    event IntentExecutorUpdated(address executor);
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

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
    }

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
     * @dev 从用户 ethBalance 扣款并转发到白名单协议
     */
    function executeStrategy(
        address user,
        address protocol,
        uint256 amount,
        bytes calldata data
    ) external onlyExecutor nonReentrant whenNotPaused {
        require(whitelistedProtocols[protocol], "Protocol not whitelisted");
        UserInfo storage userInfo = _users[user];
        require(userInfo.ethBalance >= amount, "Insufficient balance");

        userInfo.ethBalance -= amount;
        totalEthBalance -= amount;

        (bool success, ) = protocol.call{value: amount}(data);
        require(success, "Strategy execution failed");

        uint256 posId = userInfo.positionCount++;
        userInfo.positions[posId] = Position({
            protocol: protocol,
            asset: address(0),
            amount: amount,
            receivedToken: address(0),
            receivedAmount: 0,
            timestamp: block.timestamp,
            active: true
        });

        emit StrategyExecuted(user, protocol, amount);
    }

    /**
     * @notice 一笔交易完成「存入 ETH + 执行策略 + 记录 aToken 回流」
     * @param protocol 白名单 Adapter 地址（需实现 IAaveV3Adapter）
     * @dev ETH 不经过 ethBalance 中间状态，直接转发给 Adapter。
     *      合约自动构造 calldata 强制 onBehalfOf = address(this)，
     *      防止用户篡改 aToken 接收地址。
     *      通过快照 aToken 余额差计算实际回流量并记录到 Position。
     */
    function depositAndExecute(
        address protocol
    ) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Zero value");
        require(whitelistedProtocols[protocol], "Not whitelisted");

        address aToken = IAaveV3Adapter(protocol).aWETH();
        uint256 before = IERC20(aToken).balanceOf(address(this));

        IAaveV3Adapter(protocol).depositETH{value: msg.value}(address(this));

        uint256 received = IERC20(aToken).balanceOf(address(this)) - before;

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

        emit StrategyExecuted(msg.sender, protocol, msg.value);
    }

    /**
     * @notice 赎回指定持仓：将全部 aToken 余额（含利息）→ Adapter → ETH → 记入用户 ethBalance
     * @param positionId 待赎回的持仓 ID
     * @dev aToken 是 rebasing token，余额随时间增长；赎回当前全部余额而非仅初始数量。
     *      对于同一用户多个持仓共用同一 receivedToken 的场景，当前实现会赎回 Vault 持有的全部 aToken，
     *      这在多持仓并发赎回时可能导致先到先得。未来可改用比例赎回机制。
     */
    function withdrawFromProtocol(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage pos = _users[msg.sender].positions[positionId];
        require(pos.active, "Not active");

        uint256 redeemAmount = IERC20(pos.receivedToken).balanceOf(address(this));
        require(redeemAmount > 0, "No tokens to redeem");

        IERC20(pos.receivedToken).safeTransfer(pos.protocol, redeemAmount);

        uint256 ethBefore = address(this).balance;

        (bool ok, ) = pos.protocol.call(
            abi.encodeWithSignature("withdrawETH(uint256,address)", redeemAmount, address(this))
        );
        require(ok, "Withdraw failed");

        uint256 ethReceived = address(this).balance - ethBefore;

        _users[msg.sender].ethBalance += ethReceived;
        totalEthBalance += ethReceived;
        pos.active = false;

        emit PositionClosed(msg.sender, positionId, ethReceived);
    }

    // ─── Admin ───────────────────────────────────────────

    function setIntentExecutor(address executor) external onlyOwner {
        require(executor != address(0), "Zero address");
        intentExecutor = executor;
        emit IntentExecutorUpdated(executor);
    }

    function whitelistProtocol(address protocol, bool status) external onlyOwner {
        whitelistedProtocols[protocol] = status;
        emit ProtocolWhitelisted(protocol, status);
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
        uint256 surplus = address(this).balance - totalEthBalance;
        require(amount <= surplus, "Exceeds surplus");
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit ETHRescued(to, amount);
    }

    // ─── View ────────────────────────────────────────────

    function getUserBalance(address user) external view returns (uint256) {
        return _users[user].ethBalance;
    }

    function getUserPositionCount(address user) external view returns (uint256) {
        return _users[user].positionCount;
    }

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
