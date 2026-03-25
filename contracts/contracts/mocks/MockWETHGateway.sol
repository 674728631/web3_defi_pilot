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
    MockAToken public aToken;
    /// @notice 赎回利率（10000 = 100%，10500 = 105% 即 5% 利息）
    uint256 public withdrawRate = 10000;

    constructor(address _aToken) {
        aToken = MockAToken(_aToken);
    }

    /// @notice 设置赎回利率以模拟利息累积
    function setWithdrawRate(uint256 rate) external {
        withdrawRate = rate;
    }

    function depositETH(
        address /* pool */,
        address onBehalfOf,
        uint16 /* referralCode */
    ) external payable {
        aToken.mint(onBehalfOf, msg.value);
    }

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

    receive() external payable {}
}
