package handlers

import (
	"log"
	"net/http"

	"defi-pilot-backend/db"
	"defi-pilot-backend/services"

	"github.com/gin-gonic/gin"
)

type ExecuteRequest struct {
	UserAddress string                `json:"userAddress"`
	ChainID     int64                 `json:"chainId"`
	Intents     []services.IntentParam `json:"intents"`
	Deadline    int64                  `json:"deadline"`
	Signature   string                 `json:"signature"`
}

// HandleExecute processes strategy execution requests
func HandleExecute(c *gin.Context) {
	var req ExecuteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.UserAddress == "" || req.ChainID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userAddress and chainId required"})
		return
	}

	log.Printf("[EXECUTE] user=%s chain=%d intents=%d hasSig=%v",
		req.UserAddress, req.ChainID, len(req.Intents), req.Signature != "")

	mode := "direct_batch"
	if req.Signature != "" {
		mode = "solver"
	}

	db.Log(db.AuditEntry{
		EventType: "execute_request",
		UserAddr:  req.UserAddress,
		ChainID:   req.ChainID,
		Status:    "pending",
		Detail: map[string]interface{}{
			"mode":       mode,
			"intents":    len(req.Intents),
			"deadline":   req.Deadline,
		},
	})

	var result *services.ExecuteResult
	var err error

	if req.Signature != "" {
		log.Printf("[EXECUTE] solver path: deadline=%d", req.Deadline)
		result, err = services.ExecuteWithSig(
			req.UserAddress, req.Intents, req.Deadline, req.Signature, req.ChainID,
		)
	} else {
		log.Printf("[EXECUTE] direct batch path")
		result, err = services.ExecuteBatch(
			req.UserAddress, req.Intents, req.ChainID,
		)
	}

	if err != nil {
		log.Printf("[EXECUTE] failed: %v", err)
		db.Log(db.AuditEntry{
			EventType: "execute_result",
			UserAddr:  req.UserAddress,
			ChainID:   req.ChainID,
			Status:    "error",
			Detail:    map[string]interface{}{"error": err.Error(), "mode": mode},
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[EXECUTE] success: %+v", result)
	txHash := ""
	if result != nil {
		txHash = result.TxHash
	}
	db.Log(db.AuditEntry{
		EventType: "execute_result",
		UserAddr:  req.UserAddress,
		ChainID:   req.ChainID,
		TxHash:    txHash,
		Status:    "success",
		Detail:    map[string]interface{}{"mode": mode},
	})
	c.JSON(http.StatusOK, result)
}
