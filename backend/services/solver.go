package services

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"log"
	"math/big"
	"strings"

	"defi-pilot-backend/config"
	abiPkg "defi-pilot-backend/contracts"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// ExecuteResult contains the outcome of an on-chain execution
type ExecuteResult struct {
	TxHash string `json:"txHash"`
	Status string `json:"status"`
}

// Intent mirrors the on-chain struct
type Intent struct {
	Protocol common.Address
	Amount   *big.Int
	Data     []byte
}

// getSolverKey parses the solver private key from config
func getSolverKey() (*ecdsa.PrivateKey, common.Address, error) {
	solverKey, err := crypto.HexToECDSA(strings.TrimPrefix(config.C.SolverPrivateKey, "0x"))
	if err != nil {
		return nil, common.Address{}, fmt.Errorf("invalid solver private key: %w", err)
	}
	publicKey := solverKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, common.Address{}, fmt.Errorf("error casting public key")
	}
	return solverKey, crypto.PubkeyToAddress(*publicKeyECDSA), nil
}

// sendTransaction builds, signs, and broadcasts a transaction
func sendTransaction(
	client *ethclient.Client,
	solverKey *ecdsa.PrivateKey,
	solverAddr common.Address,
	to common.Address,
	txData []byte,
	value *big.Int,
	chainID int64,
) (string, error) {
	ctx := context.Background()

	nonce, err := client.PendingNonceAt(ctx, solverAddr)
	if err != nil {
		return "", fmt.Errorf("nonce error: %w", err)
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("gas price error: %w", err)
	}

	tx := types.NewTransaction(nonce, to, value, 500000, gasPrice, txData)
	signer := types.NewEIP155Signer(big.NewInt(chainID))
	signedTx, err := types.SignTx(tx, signer, solverKey)
	if err != nil {
		return "", fmt.Errorf("sign error: %w", err)
	}

	if err := client.SendTransaction(ctx, signedTx); err != nil {
		return "", fmt.Errorf("send error: %w", err)
	}

	hash := signedTx.Hash().Hex()
	log.Printf("[SOLVER] tx sent: %s (nonce=%d, to=%s, value=%s)", hash, nonce, to.Hex(), value.String())
	return hash, nil
}

// ExecuteWithSig calls executeBatchWithSig on-chain using the solver's private key
func ExecuteWithSig(
	userAddr string,
	intents []IntentParam,
	deadline int64,
	signature string,
	chainID int64,
) (*ExecuteResult, error) {
	chainCfg := config.GetChain(chainID)
	if chainCfg == nil {
		return nil, fmt.Errorf("unsupported chain: %d", chainID)
	}

	client, err := ethclient.Dial(chainCfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("RPC connection failed: %w", err)
	}
	defer client.Close()

	solverKey, solverAddr, err := getSolverKey()
	if err != nil {
		return nil, err
	}

	executorABI, err := abi.JSON(strings.NewReader(abiPkg.ExecutorABI))
	if err != nil {
		return nil, fmt.Errorf("ABI parse error: %w", err)
	}

	onChainIntents := make([]Intent, len(intents))
	totalValue := big.NewInt(0)
	for i, intent := range intents {
		amount := new(big.Int)
		if _, ok := amount.SetString(intent.Amount, 10); !ok {
			return nil, fmt.Errorf("invalid amount for intent %d: %s", i, intent.Amount)
		}
		onChainIntents[i] = Intent{
			Protocol: common.HexToAddress(intent.Protocol),
			Amount:   amount,
			Data:     common.FromHex(intent.Data),
		}
		totalValue.Add(totalValue, amount)
	}

	sigBytes := common.FromHex(signature)
	deadlineBig := big.NewInt(deadline)

	txData, err := executorABI.Pack(
		"executeBatchWithSig",
		common.HexToAddress(userAddr),
		onChainIntents,
		deadlineBig,
		sigBytes,
	)
	if err != nil {
		return nil, fmt.Errorf("ABI pack error: %w", err)
	}

	executorAddr := common.HexToAddress(chainCfg.Executor)
	hash, err := sendTransaction(client, solverKey, solverAddr, executorAddr, txData, totalValue, chainID)
	if err != nil {
		return nil, err
	}

	return &ExecuteResult{
		TxHash: hash,
		Status: "submitted",
	}, nil
}

// ExecuteBatch calls the simpler executeBatch (no signature required)
func ExecuteBatch(
	userAddr string,
	intents []IntentParam,
	chainID int64,
) (*ExecuteResult, error) {
	chainCfg := config.GetChain(chainID)
	if chainCfg == nil {
		return nil, fmt.Errorf("unsupported chain: %d", chainID)
	}

	client, err := ethclient.Dial(chainCfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("RPC connection failed: %w", err)
	}
	defer client.Close()

	solverKey, solverAddr, err := getSolverKey()
	if err != nil {
		return nil, err
	}

	executorABI, err := abi.JSON(strings.NewReader(abiPkg.ExecutorABI))
	if err != nil {
		return nil, fmt.Errorf("ABI parse error: %w", err)
	}

	onChainIntents := make([]Intent, len(intents))
	totalValue := big.NewInt(0)
	for i, intent := range intents {
		amount := new(big.Int)
		if _, ok := amount.SetString(intent.Amount, 10); !ok {
			return nil, fmt.Errorf("invalid amount for intent %d: %s", i, intent.Amount)
		}
		onChainIntents[i] = Intent{
			Protocol: common.HexToAddress(intent.Protocol),
			Amount:   amount,
			Data:     common.FromHex(intent.Data),
		}
		totalValue.Add(totalValue, amount)
	}

	txData, err := executorABI.Pack(
		"executeBatch",
		common.HexToAddress(userAddr),
		onChainIntents,
	)
	if err != nil {
		return nil, fmt.Errorf("ABI pack error: %w", err)
	}

	executorAddr := common.HexToAddress(chainCfg.Executor)
	hash, err := sendTransaction(client, solverKey, solverAddr, executorAddr, txData, totalValue, chainID)
	if err != nil {
		return nil, err
	}

	return &ExecuteResult{
		TxHash: hash,
		Status: "submitted",
	}, nil
}
