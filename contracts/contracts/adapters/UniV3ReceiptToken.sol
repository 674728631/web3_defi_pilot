// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title UniV3ReceiptToken
 * @notice Adapter 内部发行的 ERC-20 份额凭证，供 Vault 追踪 Uniswap V3 LP 头寸
 * @dev 只有 adapter（minter）可以 mint/burn。
 */
contract UniV3ReceiptToken is ERC20 {
    address public minter;

    modifier onlyMinter() {
        require(msg.sender == minter, "Only minter");
        _;
    }

    constructor(address _minter) ERC20("DeFiPilot Uni V3 LP Share", "dpUNI3") {
        minter = _minter;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }
}
