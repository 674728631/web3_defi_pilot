// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockAToken.sol";

/**
 * @title MockWETHGateway
 * @notice 模拟 Aave V3 WrappedTokenGatewayV3
 * @dev depositETH：接收 ETH，铸等额 aToken 到 onBehalfOf
 *      withdrawETH：烧 aToken，返还 ETH（可设置利率模拟收益）
 */
contract MockWETHGateway {
    /// @notice 与本网关配合使用的 MockAToken 合约（铸销与 ETH 存取均通过其完成）
    MockAToken public aToken;
    /// @notice 赎回利率（10000 = 100%，10500 = 105% 即 5% 利息）
    uint256 public withdrawRate = 10000;

    /// @param _aToken 已部署的 MockAToken 合约地址，将用于铸销与余额追踪
    constructor(address _aToken) {
        aToken = MockAToken(_aToken);
    }

    /// @notice 设置赎回利率以模拟利息累积
    function setWithdrawRate(uint256 rate) external {
        withdrawRate = rate;
    }

    /// @notice 模拟存入 ETH：按 msg.value 为 onBehalfOf 铸造等额 aToken，本合约接收原生 ETH
    function depositETH(
        address /* pool */,
        address onBehalfOf,
        uint16 /* referralCode */
    ) external payable {
        aToken.mint(onBehalfOf, msg.value);
    }

    /// @notice 模拟提取 ETH：从调用者销毁 amount 数量的 aToken，再按 withdrawRate 计算应返还 ETH 并转给 to
    function withdrawETH(
        address /* pool */,
        uint256 amount,
        address to
    ) external {
        aToken.burn(msg.sender, amount);
        uint256 ethToReturn = (amount * withdrawRate) / 10000;
        (bool ok, ) = to.call{value: ethToReturn}("");
        require(ok, "ETH transfer failed");
    }

    /// @notice 允许合约直接接收原生 ETH（用于测试或补充网关余额）
    receive() external payable {}
}
