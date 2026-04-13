// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ICompoundV3.sol";
import {IProtocolAdapter} from "../interfaces/IAaveV3.sol";

/**
 * @title CompoundV3Adapter
 * @notice Compound V3 (Comet) 协议适配器 —— 将 Vault 的 ETH 存入 Compound WETH 市场（UUPS 可升级）
 * @dev 存入：Vault call{value}(depositETH) → WETH 包装 → supply 到 Comet → Comet 记录余额给 onBehalfOf
 *      赎回：Vault 转 Comet tokens 到本合约 → withdraw WETH → 解包 ETH → 发送到 to
 *
 *      实现 IProtocolAdapter 统一接口：
 *      - aWETH() 返回 Comet 地址（作为 receipt token）
 *      - depositETH(onBehalfOf) 接收 ETH 并存入 Compound
 *      - withdrawETH(amount, to) 从 Compound 取出 ETH
 */
contract CompoundV3Adapter is Initializable, OwnableUpgradeable, UUPSUpgradeable, IProtocolAdapter {
    /// @notice Compound V3（Comet）核心市场合约，负责供应与借贷记账
    IComet public comet;
    /// @notice 包装/解包原生 ETH 的 WETH 合约
    IWETH public weth;
    /// @notice 唯一被允许调用存款与取款的 Vault 合约地址
    address public vault;

    /// @dev 仅允许已配置的 `vault` 调用，防止任意地址直接向 Comet 供应或取款
    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice 初始化适配器：绑定 Comet 与 WETH，并对 Comet 授予 WETH 无限额度（仅可调用一次）
    /// @param _comet Compound V3 Comet 市场合约地址
    /// @param _weth 与 Comet 市场匹配的 WETH 合约地址
    function initialize(address _comet, address _weth) public initializer {
        __Ownable_init(msg.sender);
        comet = IComet(_comet);
        weth = IWETH(_weth);
        weth.approve(address(_comet), type(uint256).max);
    }

    /// @dev UUPS 升级钩子：仅 owner 可授权将代理指向新的实现合约
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice 由 owner 设置或更新唯一可调用存款/取款接口的 Vault 地址
    /// @param _vault 新的 Vault 合约地址（禁止为零地址）
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    /// @notice 将 ETH 包装为 WETH 并供应到 Comet 后发出，记录余额归属方与数量
    event DepositETH(address indexed onBehalfOf, uint256 amount);
    /// @notice 从 Comet 取出并解包为原生 ETH 转出后发出
    event WithdrawETH(address indexed to, uint256 amount);
    /// @notice owner 更新绑定的 Vault 地址后发出
    event VaultUpdated(address vault);

    /// @notice Returns the Comet address as the "receipt token" (Comet implements ERC20 balanceOf)
    function aWETH() external view override returns (address) {
        return address(comet);
    }

    /**
     * @notice 将收到的 ETH 包装为 WETH 并存入 Compound V3
     * @param onBehalfOf Comet 余额接收地址（通常为 Vault）
     */
    function depositETH(address onBehalfOf) external payable override onlyVault {
        uint256 amount = msg.value;

        // ① 将收到的 ETH 包装为 WETH
        weth.deposit{value: amount}();
        // ② 确保 WETH 对 Comet 的授权额度充足
        _ensureApproval();
        // ③ 将 WETH 供应到 Compound V3，Comet 记录余额给 onBehalfOf
        comet.supplyTo(onBehalfOf, address(weth), amount);

        emit DepositETH(onBehalfOf, amount);
    }

    /**
     * @notice 从 Compound V3 取出 WETH 并解包为 ETH 发送到指定地址
     * @param amount 取出数量
     * @param to ETH 接收地址（通常为 Vault）
     * @dev 调用前，Vault 须已将 Comet tokens（供应份额）转入本合约
     */
    function withdrawETH(uint256 amount, address to) external override onlyVault {
        // ① 从 Comet 取出全部 WETH（使用 max 避免 presentValue ↔ principal 舍入误差导致 revert）
        comet.withdraw(address(weth), type(uint256).max);

        // ② 将取出的 WETH 解包为原生 ETH
        uint256 wethBal = weth.balanceOf(address(this));
        weth.withdraw(wethBal);

        // ③ 将 ETH 发送到目标地址（通常为 Vault）
        (bool sent, ) = to.call{value: wethBal}("");
        require(sent, "ETH transfer failed");
        emit WithdrawETH(to, wethBal);
    }

    /// @notice 接收原生 ETH：用于 WETH 解包退款等场景下向本合约转入 ETH
    receive() external payable {}

    /// @dev 惰性授权：仅当当前额度归零时才重新授予无限授权，节省 gas
    function _ensureApproval() internal {
        if (IERC20(address(weth)).allowance(address(this), address(comet)) == 0) {
            weth.approve(address(comet), type(uint256).max);
        }
    }
}
