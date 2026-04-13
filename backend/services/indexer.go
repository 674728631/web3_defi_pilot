package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"strconv"
	"strings"
	"time"

	"defi-pilot-backend/config"
	"defi-pilot-backend/contracts"
	"defi-pilot-backend/db"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

const (
	indexerStateKey = "last_indexed_block"
	pollInterval    = 15 * time.Second
	batchSize       = 2000
)

var (
	vaultABI    abi.ABI
	executorABI abi.ABI

	evtDeposited         common.Hash
	evtWithdrawn         common.Hash
	evtStrategyExecuted  common.Hash
	evtPositionClosed    common.Hash
	evtIntentsBatch      common.Hash
)

func initABIs() error {
	var err error
	vaultABI, err = abi.JSON(strings.NewReader(contracts.VaultABI))
	if err != nil {
		return fmt.Errorf("parse VaultABI: %w", err)
	}
	executorABI, err = abi.JSON(strings.NewReader(contracts.ExecutorABI))
	if err != nil {
		return fmt.Errorf("parse ExecutorABI: %w", err)
	}

	evtDeposited = vaultABI.Events["Deposited"].ID
	evtWithdrawn = vaultABI.Events["Withdrawn"].ID
	evtStrategyExecuted = vaultABI.Events["StrategyExecuted"].ID
	evtPositionClosed = vaultABI.Events["PositionClosed"].ID
	evtIntentsBatch = executorABI.Events["IntentsBatchExecuted"].ID
	return nil
}

// StartIndexer launches the background event indexing goroutine for the given chain.
func StartIndexer(chainID int64) {
	if err := initABIs(); err != nil {
		log.Printf("[INDEXER] ABI init failed: %v", err)
		return
	}

	chain := config.GetChain(chainID)
	if chain == nil || chain.Vault == "" || chain.Vault == "0x0000000000000000000000000000000000000000" {
		log.Printf("[INDEXER] chain %d has no vault configured, skipping", chainID)
		return
	}

	go indexLoop(chain)
	log.Printf("[INDEXER] started for chain %d (vault=%s)", chainID, chain.Vault)
}

func indexLoop(chain *config.ChainConfig) {
	for {
		if err := indexBatch(chain); err != nil {
			log.Printf("[INDEXER] error: %v", err)
		}
		time.Sleep(pollInterval)
	}
}

func indexBatch(chain *config.ChainConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, chain.RPCURL)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer client.Close()

	latestBlock, err := client.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("blockNumber: %w", err)
	}

	fromBlock := getStartBlock()
	if fromBlock >= latestBlock {
		return nil
	}

	toBlock := fromBlock + batchSize
	if toBlock > latestBlock {
		toBlock = latestBlock
	}

	vaultAddr := common.HexToAddress(chain.Vault)
	executorAddr := common.HexToAddress(chain.Executor)

	addresses := []common.Address{vaultAddr}
	if chain.Executor != "" && chain.Executor != "0x0000000000000000000000000000000000000000" {
		addresses = append(addresses, executorAddr)
	}

	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: addresses,
		Topics: [][]common.Hash{{
			evtDeposited,
			evtWithdrawn,
			evtStrategyExecuted,
			evtPositionClosed,
			evtIntentsBatch,
		}},
	}

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return fmt.Errorf("filterLogs: %w", err)
	}

	for _, vLog := range logs {
		if err := processLog(vLog); err != nil {
			log.Printf("[INDEXER] process log error (block=%d tx=%s): %v", vLog.BlockNumber, vLog.TxHash.Hex(), err)
		}
	}

	db.SetIndexerState(indexerStateKey, strconv.FormatUint(toBlock+1, 10))

	if len(logs) > 0 {
		log.Printf("[INDEXER] indexed blocks %d→%d, %d events", fromBlock, toBlock, len(logs))
	}
	return nil
}

func getStartBlock() uint64 {
	val := db.GetIndexerState(indexerStateKey)
	if val == "" {
		return 7700000 // fallback: approximate deploy block
	}
	n, err := strconv.ParseUint(val, 10, 64)
	if err != nil {
		return 7700000
	}
	return n
}

func processLog(vLog types.Log) error {
	if len(vLog.Topics) == 0 {
		return nil
	}

	d := db.GetDB()
	topic0 := vLog.Topics[0]
	blockTime := time.Now().UTC().Format(time.RFC3339)

	switch topic0 {
	case evtDeposited:
		user := common.HexToAddress(vLog.Topics[1].Hex()).Hex()
		amount := new(big.Int).SetBytes(vLog.Data).String()
		data, _ := json.Marshal(map[string]string{"amount": amount})

		ensureUser(d, user, int64(vLog.BlockNumber), blockTime)
		d.Exec("UPDATE idx_users SET eth_balance = CAST(CAST(eth_balance AS INTEGER) + ? AS TEXT), total_deposited = CAST(CAST(total_deposited AS INTEGER) + ? AS TEXT), last_activity = ? WHERE address = ?",
			amount, amount, blockTime, user)
		d.Exec("UPDATE idx_vault_stats SET total_deposits = CAST(CAST(total_deposits AS INTEGER) + ? AS TEXT), updated_at = ? WHERE id = 1",
			amount, blockTime)
		insertEvent(d, vLog, "Deposited", user, string(data), blockTime)

	case evtWithdrawn:
		user := common.HexToAddress(vLog.Topics[1].Hex()).Hex()
		amount := new(big.Int).SetBytes(vLog.Data).String()
		data, _ := json.Marshal(map[string]string{"amount": amount})

		ensureUser(d, user, int64(vLog.BlockNumber), blockTime)
		d.Exec("UPDATE idx_users SET eth_balance = CAST(CAST(eth_balance AS INTEGER) - ? AS TEXT), total_withdrawn = CAST(CAST(total_withdrawn AS INTEGER) + ? AS TEXT), last_activity = ? WHERE address = ?",
			amount, amount, blockTime, user)
		d.Exec("UPDATE idx_vault_stats SET total_withdraws = CAST(CAST(total_withdraws AS INTEGER) + ? AS TEXT), updated_at = ? WHERE id = 1",
			amount, blockTime)
		insertEvent(d, vLog, "Withdrawn", user, string(data), blockTime)

	case evtStrategyExecuted:
		user := common.HexToAddress(vLog.Topics[1].Hex()).Hex()
		values, err := vaultABI.Events["StrategyExecuted"].Inputs.NonIndexed().Unpack(vLog.Data)
		if err != nil {
			return err
		}
		protocol := values[0].(common.Address).Hex()
		amount := values[1].(*big.Int).String()
		data, _ := json.Marshal(map[string]string{"protocol": protocol, "amount": amount})

		ensureUser(d, user, int64(vLog.BlockNumber), blockTime)
		d.Exec("UPDATE idx_users SET eth_balance = CAST(CAST(eth_balance AS INTEGER) - ? AS TEXT), position_count = position_count + 1, active_positions = active_positions + 1, last_activity = ? WHERE address = ?",
			amount, blockTime, user)

		var posCount int
		d.QueryRow("SELECT position_count FROM idx_users WHERE address = ?", user).Scan(&posCount)
		posID := posCount - 1
		entityID := user + "-" + strconv.Itoa(posID)
		d.Exec("INSERT OR IGNORE INTO idx_positions (id, user_addr, position_id, protocol, amount, active, created_at, created_tx) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
			entityID, user, posID, protocol, amount, blockTime, vLog.TxHash.Hex())

		d.Exec("UPDATE idx_vault_stats SET total_positions = total_positions + 1, updated_at = ? WHERE id = 1", blockTime)
		insertEvent(d, vLog, "StrategyExecuted", user, string(data), blockTime)

	case evtPositionClosed:
		user := common.HexToAddress(vLog.Topics[1].Hex()).Hex()
		values, err := vaultABI.Events["PositionClosed"].Inputs.NonIndexed().Unpack(vLog.Data)
		if err != nil {
			return err
		}
		positionID := values[0].(*big.Int).Int64()
		ethReceived := values[1].(*big.Int).String()
		data, _ := json.Marshal(map[string]string{"positionId": strconv.FormatInt(positionID, 10), "ethReceived": ethReceived})

		ensureUser(d, user, int64(vLog.BlockNumber), blockTime)
		d.Exec("UPDATE idx_users SET eth_balance = CAST(CAST(eth_balance AS INTEGER) + ? AS TEXT), active_positions = MAX(active_positions - 1, 0), last_activity = ? WHERE address = ?",
			ethReceived, blockTime, user)

		entityID := user + "-" + strconv.FormatInt(positionID, 10)
		d.Exec("UPDATE idx_positions SET active = 0, closed_at = ?, closed_tx = ?, eth_received = ? WHERE id = ?",
			blockTime, vLog.TxHash.Hex(), ethReceived, entityID)

		d.Exec("UPDATE idx_vault_stats SET closed_positions = closed_positions + 1, updated_at = ? WHERE id = 1", blockTime)
		insertEvent(d, vLog, "PositionClosed", user, string(data), blockTime)

	case evtIntentsBatch:
		user := common.HexToAddress(vLog.Topics[1].Hex()).Hex()
		count := new(big.Int).SetBytes(vLog.Data).String()
		data, _ := json.Marshal(map[string]string{"count": count})
		insertEvent(d, vLog, "IntentsBatchExecuted", user, string(data), blockTime)
	}

	return nil
}

func ensureUser(d *sql.DB, address string, blockNum int64, blockTime string) {
	var exists int
	d.QueryRow("SELECT COUNT(*) FROM idx_users WHERE address = ?", address).Scan(&exists)
	if exists == 0 {
		d.Exec("INSERT INTO idx_users (address, first_seen_block, last_activity) VALUES (?, ?, ?)", address, blockNum, blockTime)
		d.Exec("UPDATE idx_vault_stats SET total_users = total_users + 1, updated_at = ? WHERE id = 1", blockTime)
	}
}

func insertEvent(d *sql.DB, vLog types.Log, eventType, userAddr, data, blockTime string) {
	d.Exec("INSERT INTO idx_events (block_num, tx_hash, log_index, event_type, user_addr, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		vLog.BlockNumber, vLog.TxHash.Hex(), vLog.Index, eventType, userAddr, data, blockTime)
}
