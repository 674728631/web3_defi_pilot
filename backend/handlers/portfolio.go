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
	"defi-pilot-backend/services"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gin-gonic/gin"
)

type PositionResponse struct {
	ID            int    `json:"id"`
	Protocol      string `json:"protocol"`
	ProtocolName  string `json:"protocolName"`
	Asset         string `json:"asset"`
	Amount        string `json:"amount"`
	ReceivedToken string `json:"receivedToken"`
	ReceivedAmt   string `json:"receivedAmount"`
	Timestamp     int64  `json:"timestamp"`
	Active        bool   `json:"active"`
	APY           float64 `json:"apy"`
	RiskLevel     string `json:"riskLevel"`
}

type PortfolioResponse struct {
	ChainID        int64              `json:"chainId"`
	ChainName      string             `json:"chainName"`
	Address        string             `json:"address"`
	WalletETH      string             `json:"walletEth"`
	VaultETH       string             `json:"vaultEth"`
	VaultWei       string             `json:"vaultWei"`
	TotalUSD       float64            `json:"totalUsd"`
	ETHPrice       float64            `json:"ethPrice"`
	PositionCount  int                `json:"positionCount"`
	Positions      []PositionResponse `json:"positions"`
	Healthy        bool               `json:"healthy"`
	AvgAPY         float64            `json:"avgApy"`
	ActiveChains   []string           `json:"activeChains"`
	Earned30d      float64            `json:"earned30d"`
	QueriedAt      string             `json:"queriedAt"`
}

func getETHUsdPrice() float64 {
	return services.GetETHPrice()
}

func HandlePortfolio(c *gin.Context) {
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

	ctx := context.Background()
	userAddr := common.HexToAddress(address)

	walletBalance, err := client.BalanceAt(ctx, userAddr, nil)
	if err != nil {
		walletBalance = big.NewInt(0)
	}
	walletETH := weiToETHFloat(walletBalance)

	vaultBalance := big.NewInt(0)
	posCount := 0
	var positions []PositionResponse
	healthy := true
	avgAPY := 0.0

	isVaultDeployed := chainCfg.Vault != "" &&
		chainCfg.Vault != "0x0000000000000000000000000000000000000000"

	if isVaultDeployed {
		vaultABI, err := abi.JSON(strings.NewReader(abiPkg.VaultABI))
		if err == nil {
			vaultAddr := common.HexToAddress(chainCfg.Vault)

			if data, err := vaultABI.Pack("getUserBalance", userAddr); err == nil {
				if result, err := client.CallContract(ctx, makeCall(vaultAddr, data), nil); err == nil && len(result) >= 32 {
					vaultBalance.SetBytes(result[:32])
				}
			}

			posCountBig := big.NewInt(0)
			if data, err := vaultABI.Pack("getUserPositionCount", userAddr); err == nil {
				if result, err := client.CallContract(ctx, makeCall(vaultAddr, data), nil); err == nil && len(result) >= 32 {
					posCountBig.SetBytes(result[:32])
				}
			}
			posCount = int(posCountBig.Int64())

			for i := 0; i < posCount && i < 20; i++ {
				posResp := queryPosition(client, ctx, vaultABI, vaultAddr, userAddr, i, chainID)
				if posResp != nil {
					positions = append(positions, *posResp)
				}
			}

			if data, err := vaultABI.Pack("getHealthFactor"); err == nil {
				if result, err := client.CallContract(ctx, makeCall(vaultAddr, data), nil); err == nil && len(result) >= 96 {
					healthy = result[95] == 1
				}
			}
		}
	}

	vaultETH := weiToETHFloat(vaultBalance)
	ethPrice := getETHUsdPrice()
	totalUSD := (walletETH + vaultETH) * ethPrice

	if len(positions) > 0 {
		totalWeight := 0.0
		for _, p := range positions {
			if p.Active {
				amt := parseFloat(p.Amount)
				avgAPY += p.APY * amt
				totalWeight += amt
			}
		}
		if totalWeight > 0 {
			avgAPY /= totalWeight
		}
	}

	chainName := "Sepolia"
	chainShort := "SEP"
	if chainID == 421614 {
		chainName = "Arbitrum Sepolia"
		chainShort = "ARB"
	}

	activeChains := []string{}
	if vaultETH > 0 || len(positions) > 0 {
		activeChains = append(activeChains, chainShort)
	}

	earned30d := vaultETH * ethPrice * avgAPY / 100.0 / 12.0

	resp := PortfolioResponse{
		ChainID:       chainID,
		ChainName:     chainName,
		Address:       address,
		WalletETH:     formatETH(walletETH),
		VaultETH:      formatETH(vaultETH),
		VaultWei:      vaultBalance.String(),
		TotalUSD:      totalUSD,
		ETHPrice:      ethPrice,
		PositionCount: posCount,
		Positions:     positions,
		Healthy:       healthy,
		AvgAPY:        avgAPY,
		ActiveChains:  activeChains,
		Earned30d:     earned30d,
		QueriedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, resp)
}

func queryPosition(
	client *ethclient.Client,
	ctx context.Context,
	vaultABI abi.ABI,
	vaultAddr, userAddr common.Address,
	posID int,
	chainID int64,
) *PositionResponse {
	data, err := vaultABI.Pack("getUserPosition", userAddr, big.NewInt(int64(posID)))
	if err != nil {
		return nil
	}

	result, err := client.CallContract(ctx, makeCall(vaultAddr, data), nil)
	if err != nil || len(result) < 224 {
		return nil
	}

	protocol := common.BytesToAddress(result[0:32])
	asset := common.BytesToAddress(result[32:64])
	amount := new(big.Int).SetBytes(result[64:96])
	receivedToken := common.BytesToAddress(result[96:128])
	receivedAmt := new(big.Int).SetBytes(result[128:160])
	timestamp := new(big.Int).SetBytes(result[160:192])
	active := result[223] == 1

	protocolName := "Unknown"
	riskLevel := "Medium"
	apy := 0.0

	entry := matchProtocol(protocol, chainID)
	if entry != nil {
		protocolName = entry.Name
		riskLevel = entry.Risk
		apy = entry.APY
	}

	amountETH := weiToETHFloat(amount)

	return &PositionResponse{
		ID:            posID,
		Protocol:      protocol.Hex(),
		ProtocolName:  protocolName,
		Asset:         formatAsset(asset),
		Amount:        formatETH(amountETH),
		ReceivedToken: receivedToken.Hex(),
		ReceivedAmt:   receivedAmt.String(),
		Timestamp:     timestamp.Int64(),
		Active:        active,
		APY:           apy,
		RiskLevel:     riskLevel,
	}
}

func matchProtocol(protocolAddr common.Address, chainID int64) *services.ProtocolEntry {
	chainCfg := config.GetChain(chainID)
	if chainCfg != nil && strings.EqualFold(protocolAddr.Hex(), chainCfg.Adapter) {
		entry := services.FindProtocol("Aave V3", chainID)
		if entry != nil {
			return entry
		}
	}
	return nil
}

func formatAsset(addr common.Address) string {
	if addr == (common.Address{}) {
		return "ETH"
	}
	return addr.Hex()[:10] + "..."
}

func formatETH(eth float64) string {
	return strconv.FormatFloat(eth, 'f', 6, 64)
}

func parseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func weiToETHFloat(wei *big.Int) float64 {
	f := new(big.Float).Quo(new(big.Float).SetInt(wei), new(big.Float).SetFloat64(1e18))
	result, _ := f.Float64()
	return result
}

func makeCall(to common.Address, data []byte) ethereum.CallMsg {
	return ethereum.CallMsg{To: &to, Data: data}
}
