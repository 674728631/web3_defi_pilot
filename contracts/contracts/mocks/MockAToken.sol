// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockAToken
 * @notice 测试用 ERC20，模拟 Aave 的 aWETH
 * @dev mint/burn 由 MockWETHGateway 控制，1:1 映射 ETH
 */
contract MockAToken is ERC20 {
    /// @notice 唯一有权调用 mint/burn 的网关合约地址（与 Aave Gateway 行为对应）
    address public gateway;

    /// @notice 初始化代币元数据（名称 Mock aWETH、符号 aWETH），网关需后续通过 setGateway 设置
    constructor() ERC20("Mock aWETH", "aWETH") {}

    /// @notice 设置有权铸造与销毁 aToken 的网关地址
    /// @param _gateway 新的 gateway 合约地址
    function setGateway(address _gateway) external {
        gateway = _gateway;
    }

    /// @notice 由 gateway 为指定地址铸造 aToken（测试用，1:1 对应存入逻辑）
    /// @param to 接收铸币的地址
    /// @param amount 铸造数量
    function mint(address to, uint256 amount) external {
        require(msg.sender == gateway, "Only gateway");
        _mint(to, amount);
    }

    /// @notice 由 gateway 从指定地址销毁 aToken（测试用，对应赎回/提款路径）
    /// @param from 被销毁代币的持有者地址
    /// @param amount 销毁数量
    function burn(address from, uint256 amount) external {
        require(msg.sender == gateway, "Only gateway");
        _burn(from, amount);
    }
}
