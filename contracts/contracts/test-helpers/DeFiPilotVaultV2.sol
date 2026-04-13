// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../DeFiPilotVault.sol";

/**
 * @title DeFiPilotVaultV2
 * @notice 用于测试升级流程的 V2 版本，新增 version() 和 emergencyMode 功能
 */
contract DeFiPilotVaultV2 is DeFiPilotVault {
    bool public emergencyMode;

    event EmergencyModeUpdated(bool status);

    function version() external pure returns (uint256) {
        return 2;
    }

    function setEmergencyMode(bool _mode) external onlyOwner {
        emergencyMode = _mode;
        emit EmergencyModeUpdated(_mode);
    }
}
