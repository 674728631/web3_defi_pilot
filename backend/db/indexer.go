package db

import (
	"database/sql"
	"log"
)

func migrateIndexer() error {
	_, err := auditDB.Exec(`
		CREATE TABLE IF NOT EXISTS idx_state (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS idx_users (
			address           TEXT PRIMARY KEY,
			eth_balance       TEXT NOT NULL DEFAULT '0',
			total_deposited   TEXT NOT NULL DEFAULT '0',
			total_withdrawn   TEXT NOT NULL DEFAULT '0',
			position_count    INTEGER NOT NULL DEFAULT 0,
			active_positions  INTEGER NOT NULL DEFAULT 0,
			first_seen_block  INTEGER NOT NULL DEFAULT 0,
			last_activity     TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS idx_positions (
			id            TEXT PRIMARY KEY,
			user_addr     TEXT NOT NULL,
			position_id   INTEGER NOT NULL,
			protocol      TEXT NOT NULL,
			amount        TEXT NOT NULL,
			active        INTEGER NOT NULL DEFAULT 1,
			created_at    TEXT NOT NULL DEFAULT '',
			created_tx    TEXT NOT NULL DEFAULT '',
			closed_at     TEXT,
			closed_tx     TEXT,
			eth_received  TEXT,
			FOREIGN KEY (user_addr) REFERENCES idx_users(address)
		);
		CREATE INDEX IF NOT EXISTS idx_pos_user   ON idx_positions(user_addr);
		CREATE INDEX IF NOT EXISTS idx_pos_active ON idx_positions(active);

		CREATE TABLE IF NOT EXISTS idx_events (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			block_num   INTEGER NOT NULL,
			tx_hash     TEXT NOT NULL,
			log_index   INTEGER NOT NULL,
			event_type  TEXT NOT NULL,
			user_addr   TEXT NOT NULL DEFAULT '',
			data        TEXT NOT NULL DEFAULT '{}',
			created_at  TEXT NOT NULL DEFAULT ''
		);
		CREATE INDEX IF NOT EXISTS idx_evt_type  ON idx_events(event_type);
		CREATE INDEX IF NOT EXISTS idx_evt_user  ON idx_events(user_addr);
		CREATE INDEX IF NOT EXISTS idx_evt_block ON idx_events(block_num);

		CREATE TABLE IF NOT EXISTS idx_vault_stats (
			id              INTEGER PRIMARY KEY CHECK (id = 1),
			total_users     INTEGER NOT NULL DEFAULT 0,
			total_deposits  TEXT NOT NULL DEFAULT '0',
			total_withdraws TEXT NOT NULL DEFAULT '0',
			total_positions INTEGER NOT NULL DEFAULT 0,
			closed_positions INTEGER NOT NULL DEFAULT 0,
			updated_at      TEXT NOT NULL DEFAULT ''
		);
		INSERT OR IGNORE INTO idx_vault_stats (id) VALUES (1);
	`)
	return err
}

func InitIndexer() {
	if auditDB == nil {
		log.Fatal("[INDEXER-DB] auditDB not initialized")
	}
	if err := migrateIndexer(); err != nil {
		log.Fatalf("[INDEXER-DB] migration failed: %v", err)
	}
	log.Println("[INDEXER-DB] indexer tables ready")
}

func GetDB() *sql.DB {
	return auditDB
}

// --- State ---

func GetIndexerState(key string) string {
	if auditDB == nil {
		return ""
	}
	var val string
	err := auditDB.QueryRow("SELECT value FROM idx_state WHERE key = ?", key).Scan(&val)
	if err != nil {
		return ""
	}
	return val
}

func SetIndexerState(key, value string) {
	if auditDB == nil {
		return
	}
	auditDB.Exec("INSERT OR REPLACE INTO idx_state (key, value) VALUES (?, ?)", key, value)
}

// --- Query helpers ---

type IndexedUser struct {
	Address         string `json:"address"`
	EthBalance      string `json:"ethBalance"`
	TotalDeposited  string `json:"totalDeposited"`
	TotalWithdrawn  string `json:"totalWithdrawn"`
	PositionCount   int    `json:"positionCount"`
	ActivePositions int    `json:"activePositions"`
	FirstSeenBlock  int64  `json:"firstSeenBlock"`
	LastActivity    string `json:"lastActivity"`
}

func GetAllIndexedUsers(limit, offset int) ([]IndexedUser, int, error) {
	if auditDB == nil {
		return nil, 0, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var total int
	auditDB.QueryRow("SELECT COUNT(*) FROM idx_users").Scan(&total)

	rows, err := auditDB.Query(
		"SELECT address, eth_balance, total_deposited, total_withdrawn, position_count, active_positions, first_seen_block, last_activity FROM idx_users ORDER BY CAST(eth_balance AS REAL) DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []IndexedUser
	for rows.Next() {
		var u IndexedUser
		rows.Scan(&u.Address, &u.EthBalance, &u.TotalDeposited, &u.TotalWithdrawn, &u.PositionCount, &u.ActivePositions, &u.FirstSeenBlock, &u.LastActivity)
		users = append(users, u)
	}
	return users, total, nil
}

func GetIndexedUser(address string) (*IndexedUser, error) {
	if auditDB == nil {
		return nil, nil
	}
	var u IndexedUser
	err := auditDB.QueryRow(
		"SELECT address, eth_balance, total_deposited, total_withdrawn, position_count, active_positions, first_seen_block, last_activity FROM idx_users WHERE address = ?",
		address,
	).Scan(&u.Address, &u.EthBalance, &u.TotalDeposited, &u.TotalWithdrawn, &u.PositionCount, &u.ActivePositions, &u.FirstSeenBlock, &u.LastActivity)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

type IndexedPosition struct {
	ID          string  `json:"id"`
	UserAddr    string  `json:"userAddr"`
	PositionID  int     `json:"positionId"`
	Protocol    string  `json:"protocol"`
	Amount      string  `json:"amount"`
	Active      bool    `json:"active"`
	CreatedAt   string  `json:"createdAt"`
	CreatedTx   string  `json:"createdTx"`
	ClosedAt    *string `json:"closedAt"`
	ClosedTx    *string `json:"closedTx"`
	EthReceived *string `json:"ethReceived"`
}

func GetPositionsByUser(userAddr string) ([]IndexedPosition, error) {
	if auditDB == nil {
		return nil, nil
	}
	rows, err := auditDB.Query(
		"SELECT id, user_addr, position_id, protocol, amount, active, created_at, created_tx, closed_at, closed_tx, eth_received FROM idx_positions WHERE user_addr = ? ORDER BY position_id DESC",
		userAddr,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var positions []IndexedPosition
	for rows.Next() {
		var p IndexedPosition
		var active int
		rows.Scan(&p.ID, &p.UserAddr, &p.PositionID, &p.Protocol, &p.Amount, &active, &p.CreatedAt, &p.CreatedTx, &p.ClosedAt, &p.ClosedTx, &p.EthReceived)
		p.Active = active == 1
		positions = append(positions, p)
	}
	return positions, nil
}

type IndexedEvent struct {
	ID        int64  `json:"id"`
	BlockNum  int64  `json:"blockNum"`
	TxHash    string `json:"txHash"`
	LogIndex  int    `json:"logIndex"`
	EventType string `json:"eventType"`
	UserAddr  string `json:"userAddr"`
	Data      string `json:"data"`
	CreatedAt string `json:"createdAt"`
}

func GetIndexedEvents(eventType, userAddr string, limit, offset int) ([]IndexedEvent, int, error) {
	if auditDB == nil {
		return nil, 0, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	where := "1=1"
	args := []interface{}{}
	if eventType != "" {
		where += " AND event_type = ?"
		args = append(args, eventType)
	}
	if userAddr != "" {
		where += " AND user_addr = ?"
		args = append(args, userAddr)
	}

	var total int
	countArgs := make([]interface{}, len(args))
	copy(countArgs, args)
	auditDB.QueryRow("SELECT COUNT(*) FROM idx_events WHERE "+where, countArgs...).Scan(&total)

	args = append(args, limit, offset)
	rows, err := auditDB.Query(
		"SELECT id, block_num, tx_hash, log_index, event_type, user_addr, data, created_at FROM idx_events WHERE "+where+" ORDER BY block_num DESC, log_index DESC LIMIT ? OFFSET ?",
		args...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []IndexedEvent
	for rows.Next() {
		var e IndexedEvent
		rows.Scan(&e.ID, &e.BlockNum, &e.TxHash, &e.LogIndex, &e.EventType, &e.UserAddr, &e.Data, &e.CreatedAt)
		events = append(events, e)
	}
	return events, total, nil
}

type VaultStatsRecord struct {
	TotalUsers      int    `json:"totalUsers"`
	TotalDeposits   string `json:"totalDeposits"`
	TotalWithdraws  string `json:"totalWithdraws"`
	TotalPositions  int    `json:"totalPositions"`
	ClosedPositions int    `json:"closedPositions"`
	UpdatedAt       string `json:"updatedAt"`
}

func GetVaultStats() *VaultStatsRecord {
	if auditDB == nil {
		return nil
	}
	var s VaultStatsRecord
	err := auditDB.QueryRow(
		"SELECT total_users, total_deposits, total_withdraws, total_positions, closed_positions, updated_at FROM idx_vault_stats WHERE id = 1",
	).Scan(&s.TotalUsers, &s.TotalDeposits, &s.TotalWithdraws, &s.TotalPositions, &s.ClosedPositions, &s.UpdatedAt)
	if err != nil {
		return nil
	}
	return &s
}
