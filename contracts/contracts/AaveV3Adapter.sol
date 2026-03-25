// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IAaveV3.sol";

/**
 * @title AaveV3Adapter
 * @notice Aave V3 协议适配器 —— 将 Vault 的 ETH 存入 Aave 并管理 aWETH 的赎回（UUPS 可升级）
 * @dev 纯中转逻辑，不持有资金。
 *      存入：Vault call{value}(depositETH) → Gateway 包装 WETH → Pool 铸造 aWETH 到 onBehalfOf
 *      赎回：Vault 先将 aWETH 转入本合约 → withdrawETH → Gateway 解包 → ETH 发送到 to
 */
contract AaveV3Adapter is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IWrappedTokenGatewayV3 public gateway;
    address public pool;
    IERC20 public aWETH;
    address public vault;

    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _gateway, address _pool, address _aWETH) public initializer {
        __Ownable_init(msg.sender);
        gateway = IWrappedTokenGatewayV3(_gateway);
        pool = _pool;
        aWETH = IERC20(_aWETH);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    event DepositETH(address indexed onBehalfOf, uint256 amount);
    event WithdrawETH(address indexed to, uint256 amount);
    event VaultUpdated(address vault);

    /**
     * @notice 将收到的 ETH 通过 Gateway 存入 Aave Pool
     * @param onBehalfOf aWETH 接收地址（通常为 Vault）
     * @dev 仅 Vault 可调用，防止被用作开放的 Aave 代理网关
     */
    function depositETH(address onBehalfOf) external payable onlyVault {
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
        aWETH.approve(address(gateway), amount);
        gateway.withdrawETH(pool, amount, to);
        emit WithdrawETH(to, amount);
    }

    receive() external payable {}
}
