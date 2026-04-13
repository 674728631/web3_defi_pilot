// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAaveV3.sol";

/**
 * @title AaveV3Adapter
 * @notice Aave V3 协议适配器 —— 将 Vault 的 ETH 存入 Aave 并管理 aWETH 的赎回（UUPS 可升级）
 * @dev 纯中转逻辑，不持有资金。
 *      存入：Vault call{value}(depositETH) → Gateway 包装 WETH → Pool 铸造 aWETH 到 onBehalfOf
 *      赎回：Vault 先将 aWETH 转入本合约 → withdrawETH → Gateway 解包 → ETH 发送到 to
 */
contract AaveV3Adapter is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    /// @notice Aave V3 包装网关：将原生 ETH 包装为 WETH 并代表用户与 Pool 交互
    IWrappedTokenGatewayV3 public gateway;
    /// @notice Aave V3 资金池（Pool）合约地址
    address public pool;
    /// @notice Aave 上 WETH 的计息存款凭证代币（aWETH）合约
    IERC20 public aWETH;
    /// @notice 唯一被允许调用存款与取款的 Vault 合约地址
    address public vault;

    /// @dev 仅允许已配置的 `vault` 调用，防止本合约被当作公开的 Aave 代理网关滥用
    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice 初始化适配器：绑定 Gateway、Pool 与 aWETH（仅可调用一次）
    /// @param _gateway Aave V3 Wrapped Token Gateway 合约地址
    /// @param _pool Aave V3 Pool 合约地址
    /// @param _aWETH aWETH（WETH 存款凭证）代币合约地址
    function initialize(address _gateway, address _pool, address _aWETH) public initializer {
        __Ownable_init(msg.sender);
        gateway = IWrappedTokenGatewayV3(_gateway);
        pool = _pool;
        aWETH = IERC20(_aWETH);
    }

    /// @dev UUPS 升级钩子：仅 owner 可授权将代理指向新的实现合约
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice 由 owner 设置或更新唯一可调用 `depositETH` / `withdrawETH` 的 Vault 地址
    /// @param _vault 新的 Vault 合约地址（禁止为零地址）
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    /// @notice 通过 Gateway 将 ETH 存入 Aave 后发出，记录受益地址与存入数量
    event DepositETH(address indexed onBehalfOf, uint256 amount);
    /// @notice 通过 Gateway 将 aWETH 赎回为原生 ETH 并转出后发出
    event WithdrawETH(address indexed to, uint256 amount);
    /// @notice owner 更新绑定的 Vault 地址后发出
    event VaultUpdated(address vault);

    /**
     * @notice 将收到的 ETH 通过 Gateway 存入 Aave Pool
     * @param onBehalfOf aWETH 接收地址（通常为 Vault）
     * @dev 仅 Vault 可调用，防止被用作开放的 Aave 代理网关
     */
    function depositETH(address onBehalfOf) external payable onlyVault {
        // 将 ETH 通过 Gateway 存入 Aave Pool：Gateway 自动 WETH 包装 → Pool 铸造 aWETH 到 onBehalfOf
        gateway.depositETH{value: msg.value}(pool, onBehalfOf, 0);
        emit DepositETH(onBehalfOf, msg.value);
    }

    /**
     * @notice 赎回 aWETH 为原生 ETH
     * @param amount 赎回数量
     * @param to ETH 接收地址（通常为 Vault）
     * @dev 调用前，调用者须已将 aWETH 转入本合约
     */
    function withdrawETH(uint256 amount, address to) external onlyVault {
        // ① 授权 Gateway 操作 aWETH（Gateway 内部会 transferFrom 后调用 Pool.withdraw）
        aWETH.approve(address(gateway), amount);
        // ② Gateway 销毁 aWETH → 取出 WETH → 解包为 ETH → 发送到 to
        gateway.withdrawETH(pool, amount, to);
        emit WithdrawETH(to, amount);
    }

    /// @notice 接收原生 ETH：用于 Gateway 退款等场景下向本合约转入 ETH
    receive() external payable {}
}
