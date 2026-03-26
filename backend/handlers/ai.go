package handlers

import (
	"log"
	"net/http"

	"defi-pilot-backend/services"

	"github.com/gin-gonic/gin"
)

type ChatRequest struct {
	Messages    []services.ChatMessage `json:"messages"`
	UserAddress string                 `json:"userAddress"`
	ChainID     int64                  `json:"chainId"`
}

type ChatResponse struct {
	Text     string             `json:"text"`
	Strategy *services.Strategy `json:"strategy,omitempty"`
	TxParams *services.TxParams `json:"txParams,omitempty"`
}

// HandleChat processes AI chat requests with on-chain context injection
func HandleChat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Messages required"})
		return
	}

	if req.UserAddress == "" || req.ChainID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Wallet not connected. Please connect your wallet first."})
		return
	}

	// Normalize role names
	for i := range req.Messages {
		if req.Messages[i].Role == "ai" {
			req.Messages[i].Role = "assistant"
		}
	}

	onChainCtx := ""
	if req.UserAddress != "" && req.ChainID > 0 {
		onChainCtx = services.BuildOnChainContext(req.UserAddress, req.ChainID)
	}

	aiResp := services.CallOpenAIPublic(req.Messages, onChainCtx)

	var txParams *services.TxParams
	if aiResp.Strategy != nil && req.UserAddress != "" && req.ChainID > 0 {
		encoded, err := services.EncodeStrategy(aiResp.Strategy, req.UserAddress, req.ChainID)
		if err != nil {
			log.Printf("[AI] strategy encode failed: %v", err)
			aiResp.Text += "\n\n⚠️ 策略生成成功但参数编码失败: " + err.Error()
		} else {
			txParams = encoded
		}
	}

	c.JSON(http.StatusOK, ChatResponse{
		Text:     aiResp.Text,
		Strategy: aiResp.Strategy,
		TxParams: txParams,
	})
}
