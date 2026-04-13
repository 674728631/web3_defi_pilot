package handlers

import (
	"context"
	"net/http"
	"time"

	"defi-pilot-backend/config"

	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gin-gonic/gin"
)

type ChainStatus struct {
	ChainID   int64  `json:"chainId"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms"`
	Block     uint64 `json:"block,omitempty"`
}

type ChainsHealthResponse struct {
	Chains  []ChainStatus `json:"chains"`
	Total   int           `json:"total"`
	Healthy int           `json:"healthy"`
}

var chainNames = map[int64]string{
	1:        "Ethereum",
	11155111: "Sepolia",
	42161:    "Arbitrum",
	421614:   "Arbitrum Sepolia",
	10:       "Optimism",
	11155420: "Optimism Sepolia",
	8453:     "Base",
	84532:    "Base Sepolia",
	137:      "Polygon",
	80002:    "Polygon Amoy",
	43114:    "Avalanche",
	56:       "BNB Chain",
	324:      "zkSync Era",
	534352:   "Scroll",
	59144:    "Linea",
}

func HandleChainsHealth(c *gin.Context) {
	chains := config.C.Chains
	result := make([]ChainStatus, 0, len(chains))
	healthy := 0

	for id, cfg := range chains {
		name := chainNames[id]
		if name == "" {
			name = "Unknown"
		}

		cs := ChainStatus{ChainID: id, Name: name}

		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

		client, err := ethclient.DialContext(ctx, cfg.RPCURL)
		if err != nil {
			cancel()
			cs.Status = "error"
			cs.LatencyMs = time.Since(start).Milliseconds()
			result = append(result, cs)
			continue
		}

		block, err := client.BlockNumber(ctx)
		cancel()
		client.Close()

		cs.LatencyMs = time.Since(start).Milliseconds()
		if err != nil {
			cs.Status = "error"
		} else {
			cs.Status = "ok"
			cs.Block = block
			healthy++
		}

		result = append(result, cs)
	}

	c.JSON(http.StatusOK, ChainsHealthResponse{
		Chains:  result,
		Total:   len(result),
		Healthy: healthy,
	})
}
