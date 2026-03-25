// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../IntentExecutor.sol";

/**
 * @title IntentExecutorV2
 * @notice 用于测试升级流程的 V2 版本，新增 version()
 */
contract IntentExecutorV2 is IntentExecutor {
    function version() external pure returns (uint256) {
        return 2;
    }
}
