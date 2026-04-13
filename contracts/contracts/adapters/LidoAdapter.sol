// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IProtocolAdapter} from "../interfaces/IAaveV3.sol";

interface IMockStETH {
    function submit(address referral) external payable returns (uint256);
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title LidoAdapter
 * @notice Lido (Mock) 协议适配器 —— 将 Vault 的 ETH 质押为 stETH（UUPS 可升级）
 * @dev 存入：Vault call{value}(depositETH) → MockStETH.submit → mint stETH to onBehalfOf
 *      赎回：Vault 转 stETH 到本合约 → MockStETH.withdraw → ETH 发送到 to
 *
 *      实现与 AaveV3Adapter / CompoundV3Adapter 相同的外部接口。
 */
contract LidoAdapter is Initializable, OwnableUpgradeable, UUPSUpgradeable, IProtocolAdapter {
    /// @notice Lido（本项目中为 Mock）质押合约，负责 ETH 与 stETH 的兑换
    IMockStETH public stETH;
    /// @notice 唯一被允许调用存款与取款的 Vault 合约地址
    address public vault;

    /// @dev 仅允许已配置的 `vault` 调用，防止任意地址滥用质押与赎回流程
    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice 初始化适配器：绑定 stETH（Mock）合约（仅可调用一次）
    /// @param _stETH Lido Mock stETH 合约地址
    function initialize(address _stETH) public initializer {
        __Ownable_init(msg.sender);
        stETH = IMockStETH(_stETH);
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

    /// @notice 将 ETH 提交质押并铸造/划转 stETH 后发出，记录受益人与数量
    event DepositETH(address indexed onBehalfOf, uint256 amount);
    /// @notice 销毁 stETH 并取回原生 ETH 转出后发出
    event WithdrawETH(address indexed to, uint256 amount);
    /// @notice owner 更新绑定的 Vault 地址后发出
    event VaultUpdated(address vault);

    /// @notice Returns stETH address as the "receipt token"
    function aWETH() external view override returns (address) {
        return address(stETH);
    }

    /**
     * @notice 将收到的 ETH 质押到 Lido（Mock），mint stETH 给 onBehalfOf
     * @param onBehalfOf stETH 接收地址（通常为 Vault）
     */
    function depositETH(address onBehalfOf) external payable override onlyVault {
        uint256 amount = msg.value;
        // ① 调用 Lido 的 submit 接口，将 ETH 质押换取 stETH
        stETH.submit{value: amount}(address(0));
        // ② 将铸造的 stETH 转给 onBehalfOf（通常为 Vault），作为质押凭证
        IERC20(address(stETH)).transfer(onBehalfOf, amount);
        emit DepositETH(onBehalfOf, amount);
    }

    /**
     * @notice 从 Lido（Mock）赎回 stETH 为原生 ETH
     * @param amount 赎回数量（unused, withdraws all balance）
     * @param to ETH 接收地址（通常为 Vault）
     * @dev 调用前，Vault 须已将 stETH 转入本合约
     */
    function withdrawETH(uint256 amount, address to) external override onlyVault {
        // ① 获取 Vault 转入本合约的全部 stETH 余额
        uint256 bal = stETH.balanceOf(address(this));
        // ② 调用 MockStETH.withdraw 销毁 stETH 取回等量 ETH
        stETH.withdraw(bal);
        // ③ 将取回的 ETH 发送到目标地址
        (bool sent, ) = to.call{value: bal}("");
        require(sent, "ETH transfer failed");
        emit WithdrawETH(to, bal);
    }

    /// @notice 接收原生 ETH：用于赎回等流程中向本合约转入 ETH
    receive() external payable {}
}
