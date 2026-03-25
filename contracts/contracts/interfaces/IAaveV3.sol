// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IWrappedTokenGatewayV3
 * @notice Aave V3 WrappedTokenGateway 接口 —— 将原生 ETH 包装为 WETH 并存入 Aave Pool
 */
interface IWrappedTokenGatewayV3 {
    function depositETH(
        address pool,
        address onBehalfOf,
        uint16 referralCode
    ) external payable;

    function withdrawETH(
        address pool,
        uint256 amount,
        address to
    ) external;
}

/**
 * @title IPool
 * @notice Aave V3 Pool 接口（精简版，仅保留本项目用到的方法）
 */
interface IPool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}

/**
 * @title IAaveV3Adapter
 * @notice DeFi Pilot 内部 Adapter 接口，Vault 通过此接口与 Aave 交互
 */
interface IAaveV3Adapter {
    function aWETH() external view returns (address);
    function depositETH(address onBehalfOf) external payable;
    function withdrawETH(uint256 amount, address to) external;
}
