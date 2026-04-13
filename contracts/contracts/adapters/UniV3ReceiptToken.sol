// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title UniV3ReceiptToken
 * @notice Adapter 内部发行的 ERC-20 份额凭证，供 Vault 追踪 Uniswap V3 LP 头寸
 * @dev 只有 adapter（minter）可以 mint/burn。
 */
contract UniV3ReceiptToken is ERC20 {
    /// @notice 唯一有权铸造与销毁份额凭证的适配器合约地址（minter）
    address public minter;

    /// @dev 限制调用者必须为 minter，否则 revert
    modifier onlyMinter() {
        require(msg.sender == minter, "Only minter");
        _;
    }

    /// @notice 部署时指定 minter，并初始化 ERC20 名称与符号
    /// @param _minter 将作为唯一 minter 的适配器合约地址
    constructor(address _minter) ERC20("DeFiPilot Uni V3 LP Share", "dpUNI3") {
        minter = _minter;
    }

    /// @notice 由 minter 为指定地址铸造份额凭证
    /// @param to 接收新铸代币的地址
    /// @param amount 铸造数量
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    /// @notice 由 minter 从指定地址销毁份额凭证
    /// @param from 被扣减余额并销毁代币的地址
    /// @param amount 销毁数量
    function burn(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }
}
