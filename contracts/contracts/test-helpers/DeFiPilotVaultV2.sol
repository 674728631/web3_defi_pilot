// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../DeFiPilotVault.sol";

/**
 * @title DeFiPilotVaultV2
 * @notice 用于测试升级流程的 V2 版本，新增 version() 和 emergencyMode 功能
 */
contract DeFiPilotVaultV2 is DeFiPilotVault {
    /// @notice 紧急模式开关：为 true 时表示处于紧急状态（供测试与升级场景使用）
    bool public emergencyMode;

    /// @notice 紧急模式被 owner 更新时触发，携带新的开关状态
    event EmergencyModeUpdated(bool status);

    /// @notice 返回本合约实现的逻辑版本号（固定为 2，用于升级兼容性测试）
    function version() external pure returns (uint256) {
        return 2;
    }

    /// @notice 由 owner 设置紧急模式并发出事件（仅测试/演示用扩展）
    /// @param _mode 为 true 则开启紧急模式，为 false 则关闭
    function setEmergencyMode(bool _mode) external onlyOwner {
        emergencyMode = _mode;
        emit EmergencyModeUpdated(_mode);
    }
}
