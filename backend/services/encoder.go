package services

import (
	"math/big"
	"strings"

	"defi-pilot-backend/config"

	"github.com/ethereum/go-ethereum/common"
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
func EncodeStrategy(strategy *Strategy, userAddr string, chainID int64) *TxParams {
	chainCfg := config.GetChain(chainID)
	if chainCfg == nil || strategy == nil || len(strategy.Items) == 0 {
		return nil
	}

	item := strategy.Items[0]
	entry := FindProtocol(item.Protocol, chainID)

	totalWei := big.NewInt(0)
	for _, it := range strategy.Items {
		totalWei.Add(totalWei, parseETHAmount(it.Amount))
	}

	// Path 1: Adapter available → depositAndExecute(protocol) on Vault
	if entry != nil && entry.Adapter != "" && chainCfg.Adapter != "" {
		adapterAddr := chainCfg.Adapter

		return &TxParams{
			Mode:         "direct",
			To:           chainCfg.Vault,
			FunctionName: "depositAndExecute",
			Args:         []interface{}{adapterAddr},
			Value:        totalWei.String(),
			ChainID:      chainID,
		}
	}

	// Path 2: No adapter → direct Vault deposit (user deposits ETH into vault)
	if chainCfg.Vault != "" && chainCfg.Vault != "0x0000000000000000000000000000000000000000" {
		return &TxParams{
			Mode:         "direct",
			To:           chainCfg.Vault,
			FunctionName: "deposit",
			Args:         []interface{}{},
			Value:        totalWei.String(),
			ChainID:      chainID,
		}
	}

	// Path 3: Solver path (EIP-712 signed intent)
	return encodeSolverPath(strategy, userAddr, chainID, chainCfg)
}

func encodeSolverPath(strategy *Strategy, userAddr string, chainID int64, chainCfg *config.ChainConfig) *TxParams {
	var intents []IntentParam
	for _, item := range strategy.Items {
		amountWei := parseETHAmount(item.Amount)
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
	}
}

func parseETHAmount(amountStr string) *big.Int {
	amountStr = strings.TrimSpace(amountStr)
	amountStr = strings.TrimSuffix(amountStr, " ETH")
	amountStr = strings.TrimSuffix(amountStr, " eth")

	val := new(big.Float)
	if _, ok := val.SetString(amountStr); !ok {
		return big.NewInt(0)
	}

	weiPerETH := new(big.Float).SetFloat64(1e18)
	wei := new(big.Float).Mul(val, weiPerETH)

	result, _ := wei.Int(nil)
	return result
}

