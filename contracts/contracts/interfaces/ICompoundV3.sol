// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IComet
 * @notice Compound V3 (Comet) 核心接口
 * @dev Comet 是 Compound V3 的单一市场合约（如 cUSDCv3、cWETHv3），
 *      集成了存款、借款、清算等功能。每个 Comet 实例只管理一种基础资产。
 *      Comet 本身实现了 ERC-20 的 balanceOf，余额代表用户的供应份额。
 */
interface IComet {
    /// @notice 向 Comet 供应资产（存入自己的账户）
    /// @param asset 供应的 ERC-20 代币地址（如 WETH）
    /// @param amount 供应数量
    function supply(address asset, uint256 amount) external;

    /// @notice 向 Comet 供应资产，存入指定地址的账户
    /// @param dst 余额接收地址
    /// @param asset 供应的 ERC-20 代币地址
    /// @param amount 供应数量
    function supplyTo(address dst, address asset, uint256 amount) external;

    /// @notice 从 Comet 取出资产（从自己的账户）
    /// @param asset 取出的 ERC-20 代币地址
    /// @param amount 取出数量（type(uint256).max 表示全部取出）
    function withdraw(address asset, uint256 amount) external;

    /// @notice 从 Comet 取出资产到指定地址
    /// @param to 资产接收地址
    /// @param asset 取出的 ERC-20 代币地址
    /// @param amount 取出数量
    function withdrawTo(address to, address asset, uint256 amount) external;

    /// @notice 从指定账户取出资产（需要授权）
    /// @param src 资产来源地址
    /// @param to 资产接收地址
    /// @param asset 取出的 ERC-20 代币地址
    /// @param amount 取出数量
    function withdrawFrom(address src, address to, address asset, uint256 amount) external;

    /// @notice 查询账户在 Comet 中的供应余额
    /// @param account 查询地址
    /// @return 供应余额（会随利息增长）
    function balanceOf(address account) external view returns (uint256);

    /// @notice 获取 Comet 的基础资产地址
    /// @return 基础资产的 ERC-20 合约地址（如 WETH）
    function baseToken() external view returns (address);

    /// @notice 授权/撤销某地址代为操作资产的权限
    /// @param manager 被授权的地址
    /// @param isAllowed_ true=授权，false=撤销
    function allow(address manager, bool isAllowed_) external;
}

/**
 * @title IWETH
 * @notice Wrapped Ether (WETH) 接口
 * @dev WETH 是 ETH 的 ERC-20 包装版本，1:1 兑换。
 *      存入 ETH → 铸造等量 WETH，赎回 WETH → 取回等量 ETH。
 *      多个 Adapter 共用此接口进行 ETH↔WETH 转换。
 */
interface IWETH {
    /// @notice 存入 ETH，铸造等量 WETH
    function deposit() external payable;

    /// @notice 赎回 WETH，取回等量 ETH
    /// @param wad 赎回数量（wei）
    function withdraw(uint256 wad) external;

    /// @notice 授权 spender 使用指定数量的 WETH
    /// @param guy 被授权地址
    /// @param wad 授权额度
    /// @return 是否成功
    function approve(address guy, uint256 wad) external returns (bool);

    /// @notice 查询 WETH 余额
    /// @param account 查询地址（参数名省略，遵循 WETH9 原始接口）
    /// @return WETH 余额
    function balanceOf(address account) external view returns (uint256);

    /// @notice 转账 WETH
    /// @param dst 接收地址
    /// @param wad 转账数量
    /// @return 是否成功
    function transfer(address dst, uint256 wad) external returns (bool);
}
