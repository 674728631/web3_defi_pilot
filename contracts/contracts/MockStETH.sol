// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockStETH
 * @notice 模拟 Lido stETH 的测试合约（Sepolia 上 Lido 已弃用，用此合约模拟质押行为）
 * @dev 接收 ETH → 按 1:1 铸造 stETH（简化版，不含 rebasing 机制）
 *      支持 burn stETH → 退回 ETH（模拟提款）
 */
contract MockStETH is ERC20 {
    event Submitted(address indexed sender, uint256 amount, address referral);

    constructor() ERC20("Mock Staked Ether", "stETH") {}

    /// @notice 模拟 Lido 的 submit(referral) 接口，接收 ETH 铸造 stETH
    function submit(address referral) external payable returns (uint256) {
        require(msg.value > 0, "Zero value");
        _mint(msg.sender, msg.value);
        emit Submitted(msg.sender, msg.value, referral);
        return msg.value;
    }

    /// @notice 模拟提款：burn stETH 取回 ETH
    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient stETH");
        _burn(msg.sender, amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

    receive() external payable {}
}
