package services

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ProtocolEntry describes a DeFi protocol available on a specific chain
type ProtocolEntry struct {
	Name    string
	ChainID int64
	Adapter string
	AToken  string
	Actions map[string]ActionDef
	APY     float64
	Risk    string
	TVL     float64
	Audited bool
}

// ActionDef maps an action name to its function signature and gas estimate
type ActionDef struct {
	FunctionSig string
	GasEstimate uint64
}

// Registry holds all known protocol entries (updated by FetchLiveAPY)
var Registry = []ProtocolEntry{
	{
		Name: "Aave V3", ChainID: 11155111,
		Adapter: "0x757537A14C90b0F5fc34Df503Cd12cfABfFCc2Ae",
		AToken:  "0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830",
		Actions: map[string]ActionDef{
			"ETH Lending": {FunctionSig: "depositETH(address)", GasEstimate: 250000},
		},
		APY: 0, Risk: "Low", TVL: 0, Audited: true,
	},
	{
		Name: "Lido", ChainID: 11155111,
		Adapter: "0x7d6C6Cc74555CF69Ee88CF61612649EeB91183Fd",
		AToken:  "0x42FC8b114Fbc9800a96E24d4dbba43C9AEfc6205", // MockStETH
		Actions: map[string]ActionDef{
			"stETH Staking": {FunctionSig: "depositETH(address)", GasEstimate: 250000},
		},
		APY: 0, Risk: "Low", TVL: 0, Audited: true,
	},
	{
		Name: "Compound V3", ChainID: 11155111,
		Adapter: "0xBc5249c466B8B57f87ddE537090f0b05b8A0BF76",
		AToken:  "0x2943ac1216979aD8dB76D9147F64E61adc126e96", // Comet token address
		Actions: map[string]ActionDef{
			"ETH Supply": {FunctionSig: "depositETH(address)", GasEstimate: 300000},
		},
		APY: 0, Risk: "Low", TVL: 0, Audited: true,
	},
	{
		Name: "Uniswap V3", ChainID: 11155111,
		Adapter: "0x215c0776f14a4473DcEDD6b5d6F13d4f4909248d",
		AToken:  "0x7Db0c55D27F3B6546a143d605793c983D9c27c1e", // UniV3ReceiptToken
		Actions: map[string]ActionDef{
			"ETH LP": {FunctionSig: "depositETH(address)", GasEstimate: 500000},
		},
		APY: 0, Risk: "Medium", TVL: 0, Audited: true,
	},
	{
		Name: "Aave V3", ChainID: 421614,
		Adapter: "",
		AToken:  "",
		Actions: map[string]ActionDef{
			"ETH Lending": {FunctionSig: "depositETH(address)", GasEstimate: 250000},
		},
		APY: 0, Risk: "Low", TVL: 0, Audited: true,
	},
	{
		Name: "GMX", ChainID: 421614,
		Adapter: "",
		Actions: map[string]ActionDef{
			"GLP Vault": {FunctionSig: "mintAndStakeGlp(address,uint256,uint256,uint256)", GasEstimate: 400000},
		},
		APY: 0, Risk: "Medium", TVL: 0, Audited: true,
	},
}

var RegistryMu sync.RWMutex

// DeFi Llama pool search keywords for each protocol
var defiLlamaMapping = map[string]string{
	"Aave V3":      "aave-v3",
	"Lido":         "lido",
	"Compound V3":  "compound-v3",
	"Uniswap V3":   "uniswap-v3",
	"GMX":          "gmx",
}

type llamaPool struct {
	Project string  `json:"project"`
	Symbol  string  `json:"symbol"`
	Chain   string  `json:"chain"`
	APY     float64 `json:"apy"`
	TVL     float64 `json:"tvlUsd"`
}

type llamaResponse struct {
	Data []llamaPool `json:"data"`
}

// InitRegistry fetches live APY/TVL from DeFi Llama on startup
func InitRegistry() {
	if err := FetchLiveAPY(); err != nil {
		log.Printf("[REGISTRY] Failed to fetch live data, using fallback: %v", err)
		setFallbackData()
	}

	// Refresh every 10 minutes
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			if err := FetchLiveAPY(); err != nil {
				log.Printf("[REGISTRY] Refresh failed: %v", err)
			}
		}
	}()
}

// FetchLiveAPY queries DeFi Llama /pools endpoint for real APY and TVL
func FetchLiveAPY() error {
	log.Println("[REGISTRY] Fetching live APY/TVL from DeFi Llama...")

	resp, err := http.Get("https://yields.llama.fi/pools")
	if err != nil {
		return fmt.Errorf("HTTP error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read error: %w", err)
	}

	var llamaResp llamaResponse
	if err := json.Unmarshal(body, &llamaResp); err != nil {
		return fmt.Errorf("JSON parse error: %w", err)
	}

	log.Printf("[REGISTRY] DeFi Llama returned %d pools, matching...", len(llamaResp.Data))

	// Match pools to our registry entries
	RegistryMu.Lock()
	defer RegistryMu.Unlock()

	for i := range Registry {
		entry := &Registry[i]
		llamaKey := defiLlamaMapping[entry.Name]
		if llamaKey == "" {
			continue
		}

		bestPool := findBestETHPool(llamaResp.Data, llamaKey, entry.ChainID)
		if bestPool != nil {
			entry.APY = bestPool.APY
			entry.TVL = bestPool.TVL
			log.Printf("[REGISTRY] %s (chain=%d): APY=%.2f%%, TVL=$%.0f",
				entry.Name, entry.ChainID, entry.APY, entry.TVL)
		} else {
			log.Printf("[REGISTRY] %s (chain=%d): no matching pool found", entry.Name, entry.ChainID)
		}
	}

	return nil
}

// findBestETHPool finds the best WETH/ETH pool for a project on a given chain
func findBestETHPool(pools []llamaPool, project string, chainID int64) *llamaPool {
	chainName := llamaChainName(chainID)

	var best *llamaPool
	for idx := range pools {
		p := &pools[idx]
		if !strings.EqualFold(p.Project, project) {
			continue
		}

		// Accept mainnet pools for testnet registry entries
		symbolLower := strings.ToLower(p.Symbol)
		isETH := strings.Contains(symbolLower, "weth") || strings.Contains(symbolLower, "eth")
		if !isETH {
			continue
		}

		// Match chain (Ethereum mainnet data for Sepolia testnet)
		chainLower := strings.ToLower(p.Chain)
		if chainLower != chainName && chainLower != "ethereum" {
			continue
		}

		if best == nil || p.TVL > best.TVL {
			best = p
		}
	}
	return best
}

func llamaChainName(chainID int64) string {
	switch chainID {
	case 11155111, 1:
		return "ethereum"
	case 421614, 42161:
		return "arbitrum"
	default:
		return "ethereum"
	}
}

// setFallbackData fills in reasonable defaults if DeFi Llama is unavailable
func setFallbackData() {
	fallback := map[string]struct {
		APY float64
		TVL float64
	}{
		"Aave V3":      {APY: 2.85, TVL: 8_500_000_000},
		"Lido":         {APY: 3.25, TVL: 14_200_000_000},
		"Compound V3":  {APY: 3.60, TVL: 3_200_000_000},
		"Uniswap V3":   {APY: 5.20, TVL: 4_800_000_000},
		"GMX":          {APY: 7.50, TVL: 520_000_000},
	}

	RegistryMu.Lock()
	defer RegistryMu.Unlock()

	for i := range Registry {
		if fb, ok := fallback[Registry[i].Name]; ok {
			Registry[i].APY = fb.APY
			Registry[i].TVL = fb.TVL
		}
	}
	log.Println("[REGISTRY] Using fallback APY/TVL data")
}

// FindProtocol looks up a protocol by name and chain
func FindProtocol(name string, chainID int64) *ProtocolEntry {
	RegistryMu.RLock()
	defer RegistryMu.RUnlock()

	for i := range Registry {
		if Registry[i].Name == name && Registry[i].ChainID == chainID {
			return &Registry[i]
		}
	}
	return nil
}

// GetProtocolsByRisk returns protocols at or below the given risk level
func GetProtocolsByRisk(maxRisk string, chainID int64) []ProtocolEntry {
	riskOrder := map[string]int{"Low": 0, "Medium": 1, "High": 2}
	maxLevel := riskOrder[maxRisk]

	RegistryMu.RLock()
	defer RegistryMu.RUnlock()

	var result []ProtocolEntry
	for _, p := range Registry {
		if riskOrder[p.Risk] <= maxLevel && (chainID == 0 || p.ChainID == chainID) {
			result = append(result, p)
		}
	}
	return result
}

// BuildProtocolContext generates a text summary for AI system prompt injection
func BuildProtocolContext() string {
	RegistryMu.RLock()
	defer RegistryMu.RUnlock()

	var lines string
	for _, p := range Registry {
		executable := "display-only"
		if p.Adapter != "" {
			executable = "EXECUTABLE (adapter deployed)"
		}
		lines += fmt.Sprintf("- %s (chain=%s, chainId=%d, risk=%s, %s): APY=%.2f%%, TVL=$%s, Audited=%s\n",
			p.Name, internalChainName(p.ChainID), p.ChainID, p.Risk, executable, p.APY, formatTVL(p.TVL), formatBool(p.Audited))
	}
	return lines
}

func internalChainName(chainID int64) string {
	switch chainID {
	case 11155111:
		return "sepolia"
	case 421614:
		return "arbitrumSepolia"
	case 1:
		return "ethereum"
	case 42161:
		return "arbitrum"
	default:
		return fmt.Sprintf("chain-%d", chainID)
	}
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%.2f", f)
}

func formatTVL(tvl float64) string {
	if tvl >= 1e9 {
		return fmt.Sprintf("%.1fB", tvl/1e9)
	}
	if tvl >= 1e6 {
		return fmt.Sprintf("%.0fM", tvl/1e6)
	}
	return fmt.Sprintf("%.0f", tvl)
}

func formatBool(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
