// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICompoundV3.sol"; // for IWETH
import "./interfaces/IUniswapV3.sol";
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
contract UniswapV3Adapter is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    INonfungiblePositionManager public positionManager;
    IWETH public weth;
    UniV3ReceiptToken public receiptToken;
    address public vault;

    /// @dev tokenId of the current LP position (0 = none)
    uint256 public currentTokenId;
    /// @dev Total WETH deposited (for share price calculation)
    uint256 public totalDeposited;

    // WETH/USDC pool params on Sepolia — single-sided WETH only
    address public pairedToken; // e.g., USDC on Sepolia
    uint24 public poolFee;
    int24 public tickLower;
    int24 public tickUpper;

    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    event DepositETH(address indexed onBehalfOf, uint256 amount);
    event WithdrawETH(address indexed to, uint256 amount);
    event VaultUpdated(address vault);
    event PositionCreated(uint256 tokenId, uint128 liquidity);

    /// @notice Returns receipt token address (Vault tracks this as "aWETH")
    function aWETH() external view returns (address) {
        return address(receiptToken);
    }

    /**
     * @notice 将收到的 ETH 包装为 WETH 并作为单边流动性提供给 Uniswap V3
     * @param onBehalfOf receipt token 接收地址（通常为 Vault）
     */
    function depositETH(address onBehalfOf) external payable onlyVault {
        uint256 amount = msg.value;
        weth.deposit{value: amount}();

        // Determine token ordering: WETH vs pairedToken
        (address token0, address token1) = address(weth) < pairedToken
            ? (address(weth), pairedToken)
            : (pairedToken, address(weth));

        bool wethIsToken0 = (token0 == address(weth));

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
            // Add to existing position via increase liquidity
            // For simplicity, we mint a new position each time
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

        totalDeposited += amount;
        receiptToken.mint(onBehalfOf, amount);
        emit DepositETH(onBehalfOf, amount);
    }

    /**
     * @notice 移除 Uniswap V3 流动性并将 ETH 返还
     * @param amount 赎回数量（unused, withdraws proportionally based on receipt tokens）
     * @param to ETH 接收地址（通常为 Vault）
     */
    function withdrawETH(uint256 amount, address to) external onlyVault {
        uint256 receiptBal = receiptToken.balanceOf(address(this));
        require(receiptBal > 0, "No receipt tokens");
        require(currentTokenId != 0, "No position");

        receiptToken.burn(address(this), receiptBal);

        // Get position liquidity
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

        positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: currentTokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // Unwrap WETH to ETH
        uint256 wethBal = weth.balanceOf(address(this));
        if (wethBal > 0) {
            weth.withdraw(wethBal);
        }

        uint256 ethBal = address(this).balance;
        if (ethBal > 0) {
            (bool sent, ) = to.call{value: ethBal}("");
            require(sent, "ETH transfer failed");
        }

        totalDeposited = 0;
        currentTokenId = 0;
        emit WithdrawETH(to, ethBal);
    }

    receive() external payable {}
}
