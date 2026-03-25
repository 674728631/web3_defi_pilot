package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"defi-pilot-backend/config"
)

var aiHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
}

// StrategyItem represents a single protocol allocation in a strategy
type StrategyItem struct {
	Chain    string  `json:"chain"`
	Protocol string  `json:"protocol"`
	Action   string  `json:"action"`
	Amount   string  `json:"amount"`
	APY      float64 `json:"apy"`
	Detail   string  `json:"detail"`
}

// Strategy represents a complete investment strategy
type Strategy struct {
	Items                 []StrategyItem `json:"items"`
	TotalAPY              float64        `json:"totalApy"`
	RiskLevel             string         `json:"riskLevel"`
	EstimatedYearlyReturn int            `json:"estimatedYearlyReturn"`
}

// AIResponse contains the AI text reply and optional strategy
type AIResponse struct {
	Text     string    `json:"text"`
	Strategy *Strategy `json:"strategy,omitempty"`
}

// ChatMessage is a single message in the conversation
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

const systemPrompt = `You are DeFi Pilot AI, an expert DeFi strategy advisor. You help users allocate their crypto assets across multiple chains and protocols to maximize yield while managing risk.

Available DeFi protocols:
%s

When the user describes their intent (assets, risk preference, chain preference, yield goals), you MUST respond with BOTH:
1. A brief natural language explanation (2-3 sentences in the same language as the user)
2. A JSON strategy block wrapped in ` + "```json ... ```" + ` containing:
{
  "items": [
    { "chain": "chainName", "protocol": "protocolName", "action": "actionType", "amount": "X.X ETH", "apy": 5.12, "detail": "description" }
  ],
  "totalApy": 5.17,
  "riskLevel": "Low",
  "estimatedYearlyReturn": 1892
}

Rules:
- Always diversify across at least 2 protocols
- Respect user's risk preference strictly
- Only recommend audited protocols unless user explicitly accepts unaudited
- Calculate totalApy as weighted average
- estimatedYearlyReturn in USD (use ETH=$3650 for estimation)
- If user asks a general question, respond normally without strategy JSON

User on-chain context:
%s`

// CallOpenAIPublic is the exported entry point for handlers
func CallOpenAIPublic(messages interface{}, onChainContext string) *AIResponse {
	// Accept any slice of structs with Role/Content fields via JSON round-trip
	jsonBytes, _ := json.Marshal(messages)
	var msgs []ChatMessage
	_ = json.Unmarshal(jsonBytes, &msgs)
	return callOpenAI(msgs, onChainContext)
}

// callOpenAI sends messages to OpenAI and returns parsed response
func callOpenAI(messages []ChatMessage, onChainContext string) *AIResponse {
	cfg := config.C

	if cfg.OpenAIKey == "" {
		lastMsg := ""
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i].Role == "user" {
				lastMsg = messages[i].Content
				break
			}
		}
		return buildFallbackStrategy(lastMsg)
	}

	protocolCtx := BuildProtocolContext()
	sysPrompt := fmt.Sprintf(systemPrompt, protocolCtx, onChainContext)

	log.Printf("[AI] system prompt: %d chars, messages: %d, on-chain context: %d chars",
		len(sysPrompt), len(messages), len(onChainContext))

	allMessages := append([]ChatMessage{{Role: "system", Content: sysPrompt}}, messages...)

	reqBody := openAIRequest{
		Model:       cfg.OpenAIModel,
		Messages:    allMessages,
		Temperature: 0.7,
		MaxTokens:   1500,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		log.Printf("[AI] request marshal error: %v", err)
		return &AIResponse{Text: "内部错误，请重试。"}
	}
	apiURL := cfg.OpenAIBaseURL + "/chat/completions"
	log.Printf("[AI REQUEST] url=%s model=%s messages=%d", apiURL, cfg.OpenAIModel, len(allMessages))
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(jsonBody))
	if err != nil {
		log.Printf("[AI] request creation error: %v", err)
		return &AIResponse{Text: "内部错误，请重试。"}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.OpenAIKey)

	resp, err := aiHTTPClient.Do(req)
	if err != nil {
		lastMsg := ""
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i].Role == "user" {
				lastMsg = messages[i].Content
				break
			}
		}
		return buildFallbackStrategy(lastMsg)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		log.Printf("[AI ERROR] status=%d body=%s", resp.StatusCode, string(body))
		lastMsg := ""
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i].Role == "user" {
				lastMsg = messages[i].Content
				break
			}
		}
		return buildFallbackStrategy(lastMsg)
	}

	log.Printf("[AI RESPONSE] status=%d body_len=%d", resp.StatusCode, len(body))

	var aiResp openAIResponse
	if err := json.Unmarshal(body, &aiResp); err != nil {
		log.Printf("[AI PARSE ERROR] %v", err)
		return &AIResponse{Text: "AI 解析失败，请重试。"}
	}

	if len(aiResp.Choices) == 0 {
		log.Printf("[AI] no choices in response")
		return &AIResponse{Text: "No response from AI."}
	}

	rawText := aiResp.Choices[0].Message.Content
	log.Printf("[AI CONTENT] %d chars", len(rawText))
	cleanText, strategy := parseStrategy(rawText)

	return &AIResponse{Text: cleanText, Strategy: strategy}
}

func parseStrategy(text string) (string, *Strategy) {
	re := regexp.MustCompile("(?s)```json\\s*(.*?)```")
	match := re.FindStringSubmatch(text)
	if match == nil {
		return text, nil
	}

	var strategy Strategy
	if err := json.Unmarshal([]byte(match[1]), &strategy); err != nil {
		return text, nil
	}

	clean := re.ReplaceAllString(text, "")
	clean = strings.TrimSpace(clean)

	return clean, &strategy
}

func buildFallbackStrategy(userMsg string) *AIResponse {
	lower := strings.ToLower(userMsg)
	maxRisk := "Medium"
	if strings.Contains(lower, "低") || strings.Contains(lower, "low") ||
		strings.Contains(lower, "安全") || strings.Contains(lower, "稳") {
		maxRisk = "Low"
	}

	totalETH := 5.0
	re := regexp.MustCompile(`(\d+\.?\d*)\s*(?:ETH|eth|个以太)`)
	if m := re.FindStringSubmatch(userMsg); m != nil {
		fmt.Sscanf(m[1], "%f", &totalETH)
	}

	candidates := GetProtocolsByRisk(maxRisk, 0)
	if len(candidates) == 0 {
		return &AIResponse{Text: "未找到符合条件的协议。请尝试放宽风险偏好。"}
	}
	if len(candidates) > 3 {
		candidates = candidates[:3]
	}

	portions := []float64{0.5, 0.3, 0.2}
	if len(candidates) == 2 {
		portions = []float64{0.6, 0.4}
	} else if len(candidates) == 1 {
		portions = []float64{1.0}
	}

	items := make([]StrategyItem, len(candidates))
	totalAPY := 0.0
	for i, p := range candidates {
		amt := totalETH * portions[i]
		var actionName string
		for a := range p.Actions {
			actionName = a
			break
		}
		items[i] = StrategyItem{
			Chain:    chainName(p.ChainID),
			Protocol: p.Name,
			Action:   actionName,
			Amount:   fmt.Sprintf("%.1f ETH", amt),
			APY:      p.APY,
			Detail:   fmt.Sprintf("%.1f ETH → %s · 预计收益 $%d/年", amt, p.Name, int(amt*3650*p.APY/100)),
		}
		totalAPY += p.APY * portions[i]
	}

	yearlyReturn := int(math.Round(totalETH * 3650 * totalAPY / 100))

	text := fmt.Sprintf("已扫描多条链上协议，为您找到以下最优策略：\n\n综合年化 %.2f%% · 风险评分 %s · 预估年收益 $%d",
		totalAPY, maxRisk, yearlyReturn)

	return &AIResponse{
		Text: text,
		Strategy: &Strategy{
			Items:                 items,
			TotalAPY:              math.Round(totalAPY*100) / 100,
			RiskLevel:             maxRisk,
			EstimatedYearlyReturn: yearlyReturn,
		},
	}
}

func chainName(chainID int64) string {
	switch chainID {
	case 11155111:
		return "sepolia"
	case 421614:
		return "arbitrumSepolia"
	default:
		return "unknown"
	}
}
