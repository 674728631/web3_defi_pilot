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
    /// @param user 资金所属用户地址，策略在其名下执行
    /// @param protocol 目标协议或适配器合约地址
    /// @param amount 本次策略调用涉及的资金数量（单位由协议约定）
    /// @param data 编码后的协议调用 calldata，由 Vault 转发执行
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

    /// @notice 绑定的 Vault 合约，批量意图最终由此合约调用 `executeStrategy` 转发至各协议
    IDeFiPilotVault public vault;
    /// @notice 各地址是否为已授权 Solver；为 true 时可调用执行入口（与 Owner 并列）
    mapping(address => bool) public solvers;
    /// @notice 用户 nonce，防止签名重放
    mapping(address => uint256) public nonces;

    /// @notice 是否强制要求用户签名（true 时 executeBatch 不可用，仅 executeBatchWithSig 可调用）
    bool public signatureRequired;

    /// @notice 在一批用户意图全部通过 Vault 执行完毕后发出，便于链下索引与审计
    event IntentsBatchExecuted(address indexed user, uint256 count);
    /// @notice 在 Owner 更新某地址的 Solver 授权状态（授权或撤销）时发出
    event SolverUpdated(address solver, bool status);
    /// @notice 在 Owner 更换本合约所绑定的 Vault 地址时发出
    event VaultUpdated(address vault);
    /// @notice 在 Owner 切换是否强制要求用户 EIP-712 签名时发出
    event SignatureRequirementChanged(bool required);

    /// @dev 限制调用者为已授权 Solver 或合约 Owner，用于执行类入口的访问控制
    modifier onlySolver() {
        require(solvers[msg.sender] || msg.sender == owner(), "Not a solver");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice 初始化可升级合约：设置 Owner、可暂停模块、EIP-712 域名版本，并绑定 Vault
    /// @param _vault 初始 DeFiPilot Vault 合约地址，不可为零地址
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
     * @dev 保留向后兼容；当 signatureRequired=true 时此函数被禁用。
     *      生产环境前端应优先使用 executeBatchWithSig。
     */
    function executeBatch(
        address user,
        Intent[] calldata intents
    ) external onlySolver whenNotPaused {
        require(!signatureRequired, "Signature required: use executeBatchWithSig");
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
        // ① 检查签名是否过期
        require(block.timestamp <= deadline, "Signature expired");

        // ② 将所有 intent 逐条哈希后合并为一个结构化哈希
        bytes32 intentsHash = _hashIntents(intents);

        // ③ 构造 EIP-712 structHash（包含 nonce 防重放 + deadline 防过期）
        bytes32 structHash = keccak256(abi.encode(
            BATCH_TYPEHASH,
            user,
            intentsHash,
            nonces[user]++,
            deadline
        ));

        // ④ 使用 EIP-712 域分隔符生成最终 digest，恢复签名者地址并校验
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        require(signer == user, "Invalid signature");

        // ⑤ 签名验证通过，执行批量策略
        _executeBatch(user, intents);
    }

    /// @dev 内部批量执行逻辑，复用于两个入口
    function _executeBatch(address user, Intent[] calldata intents) internal {
        // 逐条遍历 intent，依次调用 Vault.executeStrategy 触发对应协议交互
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
            // 每个 intent 的 data 字段先单独 keccak256（EIP-712 对 bytes 类型的要求）
            hashes[i] = keccak256(abi.encode(
                INTENT_TYPEHASH,
                intents[i].protocol,
                intents[i].amount,
                keccak256(intents[i].data)
            ));
        }
        // 将所有单条哈希紧凑拼接后再哈希，得到整个数组的唯一摘要
        return keccak256(abi.encodePacked(hashes));
    }

    /// @notice 由 Owner 设置或撤销某地址的 Solver 权限
    /// @param solver 待授权或撤销的 Solver 地址
    /// @param status true 表示授予 Solver 权限，false 表示撤销
    function setSolver(address solver, bool status) external onlyOwner {
        solvers[solver] = status;
        emit SolverUpdated(solver, status);
    }

    /// @notice 由 Owner 更新本执行器绑定的 Vault 合约地址
    /// @param _vault 新的 Vault 合约地址，不可为零地址
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = IDeFiPilotVault(_vault);
        emit VaultUpdated(_vault);
    }

    /// @notice 切换是否强制要求用户 EIP-712 签名
    /// @param required true=仅允许 executeBatchWithSig，false=两种路径均可用
    function setSignatureRequired(bool required) external onlyOwner {
        signatureRequired = required;
        emit SignatureRequirementChanged(required);
    }

    /// @notice 由 Owner 暂停合约，阻止所有需 `whenNotPaused` 的执行入口
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice 由 Owner 解除暂停，恢复 `executeBatch` 与 `executeBatchWithSig` 等入口
    function unpause() external onlyOwner {
        _unpause();
    }
}
