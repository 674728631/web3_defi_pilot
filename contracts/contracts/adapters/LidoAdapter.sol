// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
contract LidoAdapter is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IMockStETH public stETH;
    address public vault;

    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stETH) public initializer {
        __Ownable_init(msg.sender);
        stETH = IMockStETH(_stETH);
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

    /// @notice Returns stETH address as the "receipt token"
    function aWETH() external view returns (address) {
        return address(stETH);
    }

    /**
     * @notice 将收到的 ETH 质押到 Lido（Mock），mint stETH 给 onBehalfOf
     * @param onBehalfOf stETH 接收地址（通常为 Vault）
     */
    function depositETH(address onBehalfOf) external payable onlyVault {
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
    function withdrawETH(uint256 amount, address to) external onlyVault {
        // ① 获取 Vault 转入本合约的全部 stETH 余额
        uint256 bal = stETH.balanceOf(address(this));
        // ② 调用 MockStETH.withdraw 销毁 stETH 取回等量 ETH
        stETH.withdraw(bal);
        // ③ 将取回的 ETH 发送到目标地址
        (bool sent, ) = to.call{value: bal}("");
        require(sent, "ETH transfer failed");
        emit WithdrawETH(to, bal);
    }

    receive() external payable {}
}
