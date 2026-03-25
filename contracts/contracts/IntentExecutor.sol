// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title IDeFiPilotVault
 * @notice DeFiPilotVault 的接口定义，用于 IntentExecutor 跨合约调用
 */
interface IDeFiPilotVault {
    function executeStrategy(
        address user,
        address protocol,
        uint256 amount,
        bytes calldata data
    ) external;
}

/**
 * @title IntentExecutor
 * @notice 意图执行器 —— 将用户的 DeFi 意图翻译为链上策略调用（UUPS 可升级）
 * @dev 支持两种执行路径：
 *      1. executeBatch：Solver/Owner 直接执行（向后兼容，运维紧急通道）
 *      2. executeBatchWithSig：需携带用户 EIP-712 签名（生产推荐路径）
 *
 *      EIP-712 签名保证：
 *        - 用户对每次策略执行进行链下授权
 *        - nonce 防重放攻击
 *        - deadline 防过期签名被执行
 */
contract IntentExecutor is Initializable, OwnableUpgradeable, PausableUpgradeable, EIP712Upgradeable, UUPSUpgradeable {
    using ECDSA for bytes32;

    /// @notice 单条意图的结构体，描述一次协议交互
    struct Intent {
        address protocol;
        uint256 amount;
        bytes data;
    }

    /// @notice EIP-712 类型哈希
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(address protocol,uint256 amount,bytes data)"
    );
    bytes32 public constant BATCH_TYPEHASH = keccak256(
        "ExecuteBatch(address user,bytes32 intentsHash,uint256 nonce,uint256 deadline)"
    );

    IDeFiPilotVault public vault;
    mapping(address => bool) public solvers;
    /// @notice 用户 nonce，防止签名重放
    mapping(address => uint256) public nonces;

    event IntentsBatchExecuted(address indexed user, uint256 count);
    event SolverUpdated(address solver, bool status);
    event VaultUpdated(address vault);

    modifier onlySolver() {
        require(solvers[msg.sender] || msg.sender == owner(), "Not a solver");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _vault) public initializer {
        require(_vault != address(0), "Zero address");
        __Ownable_init(msg.sender);
        __Pausable_init();
        __EIP712_init("DeFiPilot", "1");
        vault = IDeFiPilotVault(_vault);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice 批量执行用户意图（无签名，Solver/Owner 直接路径）
     * @dev 保留向后兼容；生产环境前端应优先使用 executeBatchWithSig
     */
    function executeBatch(
        address user,
        Intent[] calldata intents
    ) external onlySolver whenNotPaused {
        _executeBatch(user, intents);
    }

    /**
     * @notice 批量执行用户意图（需 EIP-712 用户签名）
     * @param user      资金所属用户
     * @param intents   意图数组
     * @param deadline  签名过期时间戳
     * @param signature 用户的 EIP-712 签名
     */
    function executeBatchWithSig(
        address user,
        Intent[] calldata intents,
        uint256 deadline,
        bytes calldata signature
    ) external onlySolver whenNotPaused {
        require(block.timestamp <= deadline, "Signature expired");

        bytes32 intentsHash = _hashIntents(intents);

        bytes32 structHash = keccak256(abi.encode(
            BATCH_TYPEHASH,
            user,
            intentsHash,
            nonces[user]++,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        require(signer == user, "Invalid signature");

        _executeBatch(user, intents);
    }

    /// @dev 内部批量执行逻辑，复用于两个入口
    function _executeBatch(address user, Intent[] calldata intents) internal {
        for (uint256 i = 0; i < intents.length; i++) {
            vault.executeStrategy(
                user,
                intents[i].protocol,
                intents[i].amount,
                intents[i].data
            );
        }
        emit IntentsBatchExecuted(user, intents.length);
    }

    /// @dev 计算 intents 数组的结构化哈希（先逐条哈希再打包）
    function _hashIntents(Intent[] calldata intents) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](intents.length);
        for (uint256 i = 0; i < intents.length; i++) {
            hashes[i] = keccak256(abi.encode(
                INTENT_TYPEHASH,
                intents[i].protocol,
                intents[i].amount,
                keccak256(intents[i].data)
            ));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function setSolver(address solver, bool status) external onlyOwner {
        solvers[solver] = status;
        emit SolverUpdated(solver, status);
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = IDeFiPilotVault(_vault);
        emit VaultUpdated(_vault);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
