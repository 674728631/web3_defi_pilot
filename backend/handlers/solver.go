package handlers

import (
	"net/http"

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

	var result *services.ExecuteResult
	var err error

	if req.Signature != "" {
		result, err = services.ExecuteWithSig(
			req.UserAddress, req.Intents, req.Deadline, req.Signature, req.ChainID,
		)
	} else {
		result, err = services.ExecuteBatch(
			req.UserAddress, req.Intents, req.ChainID,
		)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
