// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IWrappedTokenGatewayV3
 * @notice Aave V3 WrappedTokenGateway 接口 —— 将原生 ETH 包装为 WETH 并存入 Aave Pool
 * @dev Gateway 是 Aave 官方提供的辅助合约，屏蔽了 ETH↔WETH 的手动转换。
 *      存入：ETH → WETH → Pool.supply → 铸造 aWETH
 *      赎回：aWETH → Pool.withdraw → WETH → ETH
 */
interface IWrappedTokenGatewayV3 {
    /// @notice 将 ETH 存入 Aave Pool
    /// @param pool Aave V3 Pool 合约地址
    /// @param onBehalfOf aWETH 接收地址（谁获得存款凭证）
    /// @param referralCode 推荐码（通常传 0）
    function depositETH(
        address pool,
        address onBehalfOf,
        uint16 referralCode
    ) external payable;

    /// @notice 从 Aave Pool 赎回 ETH
    /// @param pool Aave V3 Pool 合约地址
    /// @param amount 赎回数量（wei）
    /// @param to ETH 接收地址
    function withdrawETH(
        address pool,
        uint256 amount,
        address to
    ) external;
}

/**
 * @title IPool
 * @notice Aave V3 Pool 核心接口（精简版，仅保留本项目用到的方法）
 * @dev Pool 是 Aave V3 的核心合约，管理所有存借款操作。
 *      supply = 存入资产获取 aToken，withdraw = 销毁 aToken 赎回资产。
 */
interface IPool {
    /// @notice 向 Pool 供应资产（存款）
    /// @param asset 存入的 ERC-20 代币地址（如 WETH）
    /// @param amount 存入数量
    /// @param onBehalfOf aToken 接收地址
    /// @param referralCode 推荐码（通常传 0）
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /// @notice 从 Pool 赎回资产（取款）
    /// @param asset 赎回的 ERC-20 代币地址
    /// @param amount 赎回数量（type(uint256).max 表示全部赎回）
    /// @param to 资产接收地址
    /// @return 实际赎回数量
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}

/**
 * @title IProtocolAdapter
 * @notice DeFi Pilot 协议适配器统一接口
 * @dev 所有 Adapter（Aave / Compound / Lido / Uniswap 等）均实现此接口，
 *      Vault 通过此接口统一调用不同协议的存取操作。
 *      aWETH() 返回对应协议的 receipt token 地址（如 aWETH / Comet / stETH / dpUNI3）。
 */
interface IProtocolAdapter {
    /// @notice 获取该协议的 receipt token（存款凭证）地址
    /// @return receipt token 的合约地址
    function aWETH() external view returns (address);

    /// @notice 将 ETH 存入协议
    /// @param onBehalfOf receipt token 接收地址（通常为 Vault）
    function depositETH(address onBehalfOf) external payable;

    /// @notice 从协议赎回 ETH
    /// @param amount 赎回数量（wei）
    /// @param to ETH 接收地址（通常为 Vault）
    function withdrawETH(uint256 amount, address to) external;
}
