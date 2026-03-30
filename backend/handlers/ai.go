package handlers

import (
	"log"
	"net/http"

	"defi-pilot-backend/db"
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

	log.Printf("[CHAT] user=%s chain=%d messages=%d", req.UserAddress, req.ChainID, len(req.Messages))

	lastMsg := ""
	if len(req.Messages) > 0 {
		lastMsg = req.Messages[len(req.Messages)-1].Content
		if len(lastMsg) > 200 {
			lastMsg = lastMsg[:200]
		}
	}
	db.Log(db.AuditEntry{
		EventType: "chat_request",
		UserAddr:  req.UserAddress,
		ChainID:   req.ChainID,
		Detail: map[string]interface{}{
			"messageCount": len(req.Messages),
			"lastMessage":  lastMsg,
		},
	})

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
		log.Printf("[CHAT] strategy detected: %d items, encoding for chain=%d", len(aiResp.Strategy.Items), req.ChainID)

		strategyItems := make([]map[string]interface{}, len(aiResp.Strategy.Items))
		for idx, item := range aiResp.Strategy.Items {
			strategyItems[idx] = map[string]interface{}{
				"protocol": item.Protocol,
				"chain":    item.Chain,
				"amount":   item.Amount,
				"apy":      item.APY,
			}
		}
		db.Log(db.AuditEntry{
			EventType: "strategy_generated",
			UserAddr:  req.UserAddress,
			ChainID:   req.ChainID,
			Status:    "ok",
			Detail: map[string]interface{}{
				"itemCount": len(aiResp.Strategy.Items),
				"totalApy":  aiResp.Strategy.TotalAPY,
				"riskLevel": aiResp.Strategy.RiskLevel,
				"items":     strategyItems,
			},
		})

		encoded, err := services.EncodeStrategy(aiResp.Strategy, req.UserAddress, req.ChainID)
		if err != nil {
			log.Printf("[CHAT] strategy encode failed: %v", err)
			aiResp.Text += "\n\n⚠️ 策略生成成功但参数编码失败: " + err.Error()
			db.Log(db.AuditEntry{
				EventType: "strategy_encode",
				UserAddr:  req.UserAddress,
				ChainID:   req.ChainID,
				Status:    "error",
				Detail:    map[string]interface{}{"error": err.Error()},
			})
		} else {
			log.Printf("[CHAT] encoded tx: mode=%s to=%s fn=%s value=%s", encoded.Mode, encoded.To, encoded.FunctionName, encoded.Value)
			txParams = encoded
			db.Log(db.AuditEntry{
				EventType: "strategy_encode",
				UserAddr:  req.UserAddress,
				ChainID:   req.ChainID,
				Status:    "ok",
				Detail: map[string]interface{}{
					"mode":     encoded.Mode,
					"to":       encoded.To,
					"function": encoded.FunctionName,
					"value":    encoded.Value,
				},
			})
		}
	} else {
		log.Printf("[CHAT] no strategy in AI response")
		db.Log(db.AuditEntry{
			EventType: "chat_response",
			UserAddr:  req.UserAddress,
			ChainID:   req.ChainID,
			Status:    "no_strategy",
			Detail:    map[string]interface{}{"textLen": len(aiResp.Text)},
		})
	}

	c.JSON(http.StatusOK, ChatResponse{
		Text:     aiResp.Text,
		Strategy: aiResp.Strategy,
		TxParams: txParams,
	})
}
