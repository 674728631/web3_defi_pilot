package services

import (
	"fmt"
	"log"
	"math/big"
	"strings"

	"defi-pilot-backend/config"
)

// TxParams describes a ready-to-sign transaction for the frontend
type TxParams struct {
	Mode         string                 `json:"mode"` // "direct" or "solver"
	To           string                 `json:"to,omitempty"`
	FunctionName string                 `json:"functionName,omitempty"`
	Args         []interface{}          `json:"args,omitempty"`
	Value        string                 `json:"value,omitempty"`
	ChainID      int64                  `json:"chainId,omitempty"`
	EIP712Domain map[string]interface{} `json:"eip712Domain,omitempty"`
	EIP712Types  map[string]interface{} `json:"eip712Types,omitempty"`
	EIP712Msg    map[string]interface{} `json:"eip712Message,omitempty"`
	Intents      []IntentParam          `json:"intents,omitempty"`
}

// IntentParam is the on-chain Intent struct serialized for the frontend
type IntentParam struct {
	Protocol string `json:"protocol"`
	Amount   string `json:"amount"`
	Data     string `json:"data"`
}

// EncodeStrategy converts a strategy into ready-to-sign transaction parameters
func EncodeStrategy(strategy *Strategy, userAddr string, chainID int64) (*TxParams, error) {
	chainCfg := config.GetChain(chainID)
	if chainCfg == nil || strategy == nil || len(strategy.Items) == 0 {
		return nil, fmt.Errorf("invalid strategy or unsupported chain %d", chainID)
	}

	item := strategy.Items[0]
	entry := FindProtocol(item.Protocol, chainID)

	log.Printf("[ENCODER] protocol=%q chain=%d registryMatch=%v adapterInRegistry=%q adapterInConfig=%q",
		item.Protocol, chainID, entry != nil,
		func() string { if entry != nil { return entry.Adapter }; return "" }(),
		chainCfg.Adapter)

	totalWei := big.NewInt(0)
	for _, it := range strategy.Items {
		wei, err := parseETHAmount(it.Amount)
		if err != nil {
			return nil, fmt.Errorf("invalid amount %q: %w", it.Amount, err)
		}
		if wei.Sign() <= 0 {
			return nil, fmt.Errorf("amount must be positive, got %q", it.Amount)
		}
		totalWei.Add(totalWei, wei)
	}

	// Path 1: Adapter available → depositAndExecute(protocol) on Vault
	if entry != nil && entry.Adapter != "" && chainCfg.Adapter != "" {
		adapterAddr := chainCfg.Adapter
		log.Printf("[ENCODER] → Path 1 (depositAndExecute): vault=%s adapter=%s value=%s wei",
			chainCfg.Vault, adapterAddr, totalWei.String())

		return &TxParams{
			Mode:         "direct",
			To:           chainCfg.Vault,
			FunctionName: "depositAndExecute",
			Args:         []interface{}{adapterAddr},
			Value:        totalWei.String(),
			ChainID:      chainID,
		}, nil
	}

	// Path 2: No adapter → direct Vault deposit (user deposits ETH into vault)
	if chainCfg.Vault != "" && chainCfg.Vault != "0x0000000000000000000000000000000000000000" {
		log.Printf("[ENCODER] → Path 2 (deposit): vault=%s value=%s wei", chainCfg.Vault, totalWei.String())
		return &TxParams{
			Mode:         "direct",
			To:           chainCfg.Vault,
			FunctionName: "deposit",
			Args:         []interface{}{},
			Value:        totalWei.String(),
			ChainID:      chainID,
		}, nil
	}

	// Path 3: Solver path (EIP-712 signed intent)
	log.Printf("[ENCODER] → Path 3 (solver): intents=%d", len(strategy.Items))
	return encodeSolverPath(strategy, userAddr, chainID, chainCfg)
}

func encodeSolverPath(strategy *Strategy, userAddr string, chainID int64, chainCfg *config.ChainConfig) (*TxParams, error) {
	var intents []IntentParam
	for _, item := range strategy.Items {
		amountWei, err := parseETHAmount(item.Amount)
		if err != nil {
			return nil, fmt.Errorf("invalid amount %q in solver path: %w", item.Amount, err)
		}
		if amountWei.Sign() <= 0 {
			return nil, fmt.Errorf("solver intent amount must be positive, got %q", item.Amount)
		}
		intents = append(intents, IntentParam{
			Protocol: chainCfg.Adapter,
			Amount:   amountWei.String(),
			Data:     "0x",
		})
	}

	return &TxParams{
		Mode:    "solver",
		ChainID: chainID,
		EIP712Domain: map[string]interface{}{
			"name":              "DeFiPilot",
			"version":           "1",
			"chainId":           chainID,
			"verifyingContract": chainCfg.Executor,
		},
		EIP712Types: map[string]interface{}{
			"ExecuteBatch": []map[string]string{
				{"name": "user", "type": "address"},
				{"name": "intentsHash", "type": "bytes32"},
				{"name": "nonce", "type": "uint256"},
				{"name": "deadline", "type": "uint256"},
			},
		},
		Intents: intents,
	}, nil
}

func parseETHAmount(amountStr string) (*big.Int, error) {
	amountStr = strings.TrimSpace(amountStr)
	amountStr = strings.TrimSuffix(amountStr, " ETH")
	amountStr = strings.TrimSuffix(amountStr, " eth")

	if amountStr == "" {
		return nil, fmt.Errorf("empty amount string")
	}

	val := new(big.Float)
	if _, ok := val.SetString(amountStr); !ok {
		return nil, fmt.Errorf("cannot parse %q as number", amountStr)
	}

	weiPerETH := new(big.Float).SetFloat64(1e18)
	wei := new(big.Float).Mul(val, weiPerETH)

	result, _ := wei.Int(nil)
	return result, nil
}

