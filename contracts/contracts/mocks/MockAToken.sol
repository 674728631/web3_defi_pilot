// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockAToken
 * @notice 测试用 ERC20，模拟 Aave 的 aWETH
 * @dev mint/burn 由 MockWETHGateway 控制，1:1 映射 ETH
 */
contract MockAToken is ERC20 {
    address public gateway;

    constructor() ERC20("Mock aWETH", "aWETH") {}

    function setGateway(address _gateway) external {
        gateway = _gateway;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == gateway, "Only gateway");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == gateway, "Only gateway");
        _burn(from, amount);
    }
}
