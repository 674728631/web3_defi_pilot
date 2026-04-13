// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ICompoundV3.sol"; // for IWETH
import "../interfaces/IUniswapV3.sol";
import {IProtocolAdapter} from "../interfaces/IAaveV3.sol";
import "./UniV3ReceiptToken.sol";

/**
 * @title UniswapV3Adapter
 * @notice Uniswap V3 协议适配器 —— 将 Vault 的 ETH 作为单边 WETH 流动性提供（UUPS 可升级）
 * @dev 存入：Vault call{value}(depositETH) → WETH 包装 → mint LP position (单边 WETH) → 发行 receipt token
 *      赎回：burn receipt token → decreaseLiquidity → collect → 解包 WETH → 发送 ETH
 *
 *      Uni V3 LP 头寸为 ERC-721 NFT，无法直接用 Vault 的 ERC-20 balanceOf 追踪。
 *      解决方案：Adapter 内部持有 NFT，同时发行 ERC-20 receipt token (dpUNI3) 给 Vault。
 */
contract UniswapV3Adapter is Initializable, OwnableUpgradeable, UUPSUpgradeable, IProtocolAdapter {
    /// @notice Uniswap V3 非同质化头寸管理器（NFT LP）合约地址
    INonfungiblePositionManager public positionManager;
    /// @notice 包装/解包原生 ETH 的 WETH 合约
    IWETH public weth;
    /// @notice 由本适配器发行的 ERC-20 收据代币，供 Vault 按份额追踪单边流动性敞口
    UniV3ReceiptToken public receiptToken;
    /// @notice 唯一被允许调用存款与取款的 Vault 合约地址
    address public vault;

    /// @notice 当前持有的 Uniswap V3 LP NFT 的 `tokenId`（0 表示尚无头寸）
    uint256 public currentTokenId;
    /// @notice 累计记入的 WETH 存款总量（用于份额与会计参考）
    uint256 public totalDeposited;

    /// @notice 与 WETH 组成交易对的另一侧代币地址（例如测试网上的 USDC）
    address public pairedToken;
    /// @notice 所选流动性池的手续费等级（Uniswap `fee` 参数，如 3000 = 0.3%）
    uint24 public poolFee;
    /// @notice 流动性头寸价格区间的下边界 tick（与池 tick 间距匹配）
    int24 public tickLower;
    /// @notice 流动性头寸价格区间的上边界 tick（与池 tick 间距匹配）
    int24 public tickUpper;

    /// @dev 仅允许已配置的 `vault` 调用，防止任意地址铸造头寸或抽走流动性
    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice 初始化适配器：绑定头寸管理器、WETH、交易对与费率，并部署收据代币（仅可调用一次）
    /// @param _positionManager Uniswap V3 NonfungiblePositionManager 合约地址
    /// @param _weth WETH 合约地址
    /// @param _pairedToken 与 WETH 组成池子的对端 ERC-20 代币地址
    /// @param _poolFee 池子费率等级（须与链上已部署池一致）
    function initialize(
        address _positionManager,
        address _weth,
        address _pairedToken,
        uint24 _poolFee
    ) public initializer {
        __Ownable_init(msg.sender);
        positionManager = INonfungiblePositionManager(_positionManager);
        weth = IWETH(_weth);
        pairedToken = _pairedToken;
        poolFee = _poolFee;

        // Full range ticks for 0.3% fee pool (tick spacing = 60)
        tickLower = -887220;
        tickUpper = 887220;

        receiptToken = new UniV3ReceiptToken(address(this));
        weth.approve(address(_positionManager), type(uint256).max);
    }

    /// @dev UUPS 升级钩子：仅 owner 可授权将代理指向新的实现合约
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice 由 owner 设置或更新唯一可调用存款/取款接口的 Vault 地址
    /// @param _vault 新的 Vault 合约地址（禁止为零地址）
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    /// @notice 将 ETH 包装为 WETH 并增加单边流动性、铸造收据代币后发出
    event DepositETH(address indexed onBehalfOf, uint256 amount);
    /// @notice 移除流动性、收取代币并解包为原生 ETH 转出后发出
    event WithdrawETH(address indexed to, uint256 amount);
    /// @notice owner 更新绑定的 Vault 地址后发出
    event VaultUpdated(address vault);
    /// @notice 成功在头寸管理器上铸造新的 LP NFT 头寸后发出
    event PositionCreated(uint256 tokenId, uint128 liquidity);

    /// @notice Returns receipt token address (Vault tracks this as "aWETH")
    function aWETH() external view override returns (address) {
        return address(receiptToken);
    }

    /**
     * @notice 将收到的 ETH 包装为 WETH 并作为单边流动性提供给 Uniswap V3
     * @param onBehalfOf receipt token 接收地址（通常为 Vault）
     */
    function depositETH(address onBehalfOf) external payable override onlyVault {
        // ① 将收到的 ETH 包装为 WETH
        uint256 amount = msg.value;
        weth.deposit{value: amount}();

        // ② 确定 Uniswap V3 池中 token0/token1 的排序（地址小的在前）
        (address token0, address token1) = address(weth) < pairedToken
            ? (address(weth), pairedToken)
            : (pairedToken, address(weth));

        bool wethIsToken0 = (token0 == address(weth));

        // ③ 铸造新的 LP 头寸（单边 WETH，另一侧为 0）
        //    无论是否已有头寸，均创建新 NFT 以简化逻辑
        if (currentTokenId == 0) {
            INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: poolFee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: wethIsToken0 ? amount : 0,
                amount1Desired: wethIsToken0 ? 0 : amount,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 300
            });

            (uint256 tokenId, uint128 liquidity, , ) = positionManager.mint(params);
            currentTokenId = tokenId;
            emit PositionCreated(tokenId, liquidity);
        } else {
            INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: poolFee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: wethIsToken0 ? amount : 0,
                amount1Desired: wethIsToken0 ? 0 : amount,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 300
            });

            (uint256 tokenId, uint128 liquidity, , ) = positionManager.mint(params);
            currentTokenId = tokenId;
            emit PositionCreated(tokenId, liquidity);
        }

        // ④ 累计存入总量，并铸造等量 receipt token (dpUNI3) 给 Vault 用于余额追踪
        totalDeposited += amount;
        receiptToken.mint(onBehalfOf, amount);
        emit DepositETH(onBehalfOf, amount);
    }

    /**
     * @notice 移除 Uniswap V3 流动性并将 ETH 返还
     * @param amount 赎回数量（unused, withdraws proportionally based on receipt tokens）
     * @param to ETH 接收地址（通常为 Vault）
     */
    function withdrawETH(uint256 amount, address to) external override onlyVault {
        // ① 校验：Vault 必须已将 receipt token 转入本合约，且存在活跃 LP 头寸
        uint256 receiptBal = receiptToken.balanceOf(address(this));
        require(receiptBal > 0, "No receipt tokens");
        require(currentTokenId != 0, "No position");

        // ② 销毁 receipt token，代表赎回凭证已使用
        receiptToken.burn(address(this), receiptBal);

        // ③ 查询当前 LP 头寸的流动性，然后全额移除
        (, , , , , , , uint128 liquidity, , , , ) = positionManager.positions(currentTokenId);

        if (liquidity > 0) {
            positionManager.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: currentTokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp + 300
                })
            );
        }

        // ④ 收取移除流动性后释放的代币（含累积的交易手续费收益）
        positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: currentTokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // ⑤ 将收到的 WETH 解包为原生 ETH
        uint256 wethBal = weth.balanceOf(address(this));
        if (wethBal > 0) {
            weth.withdraw(wethBal);
        }

        // ⑥ 将全部 ETH 发送到目标地址，并重置 Adapter 状态
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) {
            (bool sent, ) = to.call{value: ethBal}("");
            require(sent, "ETH transfer failed");
        }

        totalDeposited = 0;
        currentTokenId = 0;
        emit WithdrawETH(to, ethBal);
    }

    /// @notice 接收原生 ETH：用于 WETH 解包或退款等场景下向本合约转入 ETH
    receive() external payable {}
}
