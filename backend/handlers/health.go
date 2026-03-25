package handlers

import (
	"context"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"defi-pilot-backend/config"
	abiPkg "defi-pilot-backend/contracts"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gin-gonic/gin"
)

type HealthResponse struct {
	ChainID        int64  `json:"chainId"`
	VaultAddress   string `json:"vaultAddress"`
	ActualBalance  string `json:"actualBalance"`
	TotalAccounted string `json:"totalAccounted"`
	Healthy        bool   `json:"healthy"`
	Surplus        string `json:"surplus"`
	CheckedAt      string `json:"checkedAt"`
}

type BalanceResponse struct {
	ChainID    int64  `json:"chainId"`
	Address    string `json:"address"`
	EthBalance string `json:"ethBalance"`
	WeiBalance string `json:"weiBalance"`
}

// HandleVaultBalance queries a user's ETH balance in the vault
func HandleVaultBalance(c *gin.Context) {
	address := c.Query("address")
	chainIDStr := c.DefaultQuery("chainId", "11155111")
	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chainId"})
		return
	}

	if address == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "address required"})
		return
	}

	chainCfg := config.GetChain(chainID)
	if chainCfg == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported chain"})
		return
	}

	client, err := ethclient.Dial(chainCfg.RPCURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC connection failed"})
		return
	}
	defer client.Close()

	vaultABI, err := abi.JSON(strings.NewReader(abiPkg.VaultABI))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ABI parse failed"})
		return
	}
	vaultAddr := common.HexToAddress(chainCfg.Vault)
	userAddr := common.HexToAddress(address)

	data, err := vaultABI.Pack("getUserBalance", userAddr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ABI pack failed"})
		return
	}
	result, err := client.CallContract(context.Background(), ethereum.CallMsg{
		To:   &vaultAddr,
		Data: data,
	}, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Contract call failed"})
		return
	}

	if len(result) < 32 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unexpected contract response"})
		return
	}

	weiBalance := new(big.Int).SetBytes(result[0:32])

	ethFloat := new(big.Float).Quo(
		new(big.Float).SetInt(weiBalance),
		new(big.Float).SetFloat64(1e18),
	)
	ethStr := ethFloat.Text('f', 6)

	c.JSON(http.StatusOK, BalanceResponse{
		ChainID:    chainID,
		Address:    address,
		EthBalance: ethStr,
		WeiBalance: weiBalance.String(),
	})
}

// HandleVaultHealth queries the vault's health factor
func HandleVaultHealth(c *gin.Context) {
	chainIDStr := c.DefaultQuery("chainId", "11155111")
	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chainId"})
		return
	}

	chainCfg := config.GetChain(chainID)
	if chainCfg == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported chain"})
		return
	}

	client, err := ethclient.Dial(chainCfg.RPCURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC connection failed"})
		return
	}
	defer client.Close()

	vaultABI, err := abi.JSON(strings.NewReader(abiPkg.VaultABI))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ABI parse failed"})
		return
	}
	vaultAddr := common.HexToAddress(chainCfg.Vault)

	data, err := vaultABI.Pack("getHealthFactor")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ABI pack failed"})
		return
	}
	result, err := client.CallContract(context.Background(), ethereum.CallMsg{
		To:   &vaultAddr,
		Data: data,
	}, nil)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Contract call failed"})
		return
	}

	if len(result) < 96 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unexpected contract response"})
		return
	}

	actualBalance := new(big.Int).SetBytes(result[0:32])
	totalAccounted := new(big.Int).SetBytes(result[32:64])
	healthy := result[95] == 1

	surplus := new(big.Int).Sub(actualBalance, totalAccounted)

	c.JSON(http.StatusOK, HealthResponse{
		ChainID:        chainID,
		VaultAddress:   chainCfg.Vault,
		ActualBalance:  actualBalance.String(),
		TotalAccounted: totalAccounted.String(),
		Healthy:        healthy,
		Surplus:        surplus.String(),
		CheckedAt:      time.Now().UTC().Format(time.RFC3339),
	})
}
