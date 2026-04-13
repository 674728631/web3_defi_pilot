// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title INonfungiblePositionManager
 * @notice Uniswap V3 NonfungiblePositionManager 接口（精简版）
 * @dev 管理 Uniswap V3 的 LP 头寸（每个头寸是一个 ERC-721 NFT）。
 *      mint = 创建新 LP 头寸，decreaseLiquidity = 移除流动性，collect = 收取代币和手续费。
 */
interface INonfungiblePositionManager {
    /// @notice 铸造新 LP 头寸的参数
    /// @dev token0 地址必须小于 token1（Uniswap V3 约定）
    struct MintParams {
        address token0;          // 交易对中地址较小的代币
        address token1;          // 交易对中地址较大的代币
        uint24 fee;              // 手续费等级（500=0.05%, 3000=0.3%, 10000=1%）
        int24 tickLower;         // 价格区间下界（tick 值）
        int24 tickUpper;         // 价格区间上界（tick 值）
        uint256 amount0Desired;  // 希望投入的 token0 数量
        uint256 amount1Desired;  // 希望投入的 token1 数量
        uint256 amount0Min;      // token0 最小投入量（滑点保护）
        uint256 amount1Min;      // token1 最小投入量（滑点保护）
        address recipient;       // NFT 接收地址
        uint256 deadline;        // 交易截止时间（block.timestamp）
    }

    /// @notice 减少流动性的参数
    struct DecreaseLiquidityParams {
        uint256 tokenId;         // LP 头寸的 NFT tokenId
        uint128 liquidity;       // 要移除的流动性数量
        uint256 amount0Min;      // token0 最小取出量（滑点保护）
        uint256 amount1Min;      // token1 最小取出量（滑点保护）
        uint256 deadline;        // 交易截止时间
    }

    /// @notice 收取代币的参数（移除流动性后或累积手续费）
    struct CollectParams {
        uint256 tokenId;         // LP 头寸的 NFT tokenId
        address recipient;       // 代币接收地址
        uint128 amount0Max;      // 最大收取 token0 数量（type(uint128).max = 全部）
        uint128 amount1Max;      // 最大收取 token1 数量
    }

    /// @notice 铸造新的 LP 头寸（创建流动性仓位）
    /// @param params 铸造参数
    /// @return tokenId 新创建的 NFT tokenId
    /// @return liquidity 实际添加的流动性数量
    /// @return amount0 实际使用的 token0 数量
    /// @return amount1 实际使用的 token1 数量
    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    /// @notice 减少 LP 头寸的流动性（但不取出代币，需调用 collect）
    /// @param params 减少流动性参数
    /// @return amount0 释放的 token0 数量
    /// @return amount1 释放的 token1 数量
    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    /// @notice 收取 LP 头寸中待领取的代币（包括移除流动性释放的 + 累积的交易手续费）
    /// @param params 收取参数
    /// @return amount0 实际收取的 token0 数量
    /// @return amount1 实际收取的 token1 数量
    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    /// @notice 查询 LP 头寸的详细信息
    /// @param tokenId LP 头寸的 NFT tokenId
    /// @return nonce 用于 permit 的 nonce
    /// @return operator 被授权操作此 NFT 的地址
    /// @return token0 交易对 token0 地址
    /// @return token1 交易对 token1 地址
    /// @return fee 手续费等级
    /// @return tickLower 价格区间下界
    /// @return tickUpper 价格区间上界
    /// @return liquidity 当前流动性数量
    /// @return feeGrowthInside0LastX128 token0 手续费累积快照
    /// @return feeGrowthInside1LastX128 token1 手续费累积快照
    /// @return tokensOwed0 待领取的 token0 数量
    /// @return tokensOwed1 待领取的 token1 数量
    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

/**
 * @title IUniswapV3Factory
 * @notice Uniswap V3 工厂接口 —— 查询交易池地址
 * @dev Factory 是 Uniswap V3 的工厂合约，负责创建和管理交易池。
 */
interface IUniswapV3Factory {
    /// @notice 根据代币对和手续费等级查询交易池地址
    /// @param tokenA 代币 A 地址（顺序无关）
    /// @param tokenB 代币 B 地址
    /// @param fee 手续费等级（500/3000/10000）
    /// @return pool 交易池合约地址（不存在则返回 address(0)）
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}
