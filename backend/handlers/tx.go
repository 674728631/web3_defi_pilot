package handlers

import (
	"context"
	"log"
	"net/http"
	"strconv"

	"defi-pilot-backend/config"
	"defi-pilot-backend/db"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gin-gonic/gin"
)

// HandleTxStatus queries transaction receipt and status
func HandleTxStatus(c *gin.Context) {
	hash := c.Param("hash")
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

	txHash := common.HexToHash(hash)
	log.Printf("[TX] query hash=%s chain=%d", hash, chainID)

	receipt, err := client.TransactionReceipt(context.Background(), txHash)
	if err != nil {
		log.Printf("[TX] hash=%s → pending (no receipt yet)", hash)
		c.JSON(http.StatusOK, gin.H{
			"hash":   hash,
			"status": "pending",
		})
		return
	}

	status := "failed"
	if receipt.Status == 1 {
		status = "success"
	}

	log.Printf("[TX] hash=%s → %s block=%d gas=%d", hash, status, receipt.BlockNumber.Uint64(), receipt.GasUsed)
	db.Log(db.AuditEntry{
		EventType: "tx_confirmed",
		ChainID:   chainID,
		TxHash:    hash,
		Status:    status,
		Detail: map[string]interface{}{
			"blockNumber": receipt.BlockNumber.Uint64(),
			"gasUsed":     receipt.GasUsed,
		},
	})
	c.JSON(http.StatusOK, gin.H{
		"hash":        hash,
		"status":      status,
		"blockNumber": receipt.BlockNumber.Uint64(),
		"gasUsed":     receipt.GasUsed,
	})
}
