package db

import (
	"database/sql"
	"encoding/json"
	"log"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

var (
	auditDB   *sql.DB
	auditOnce sync.Once
)

func Init(dbPath string) {
	auditOnce.Do(func() {
		var err error
		auditDB, err = sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
		if err != nil {
			log.Fatalf("[AUDIT-DB] failed to open: %v", err)
		}
		auditDB.SetMaxOpenConns(1)

		if err := migrate(); err != nil {
			log.Fatalf("[AUDIT-DB] migration failed: %v", err)
		}
		log.Printf("[AUDIT-DB] initialized at %s", dbPath)
	})
}

func migrate() error {
	_, err := auditDB.Exec(`
		CREATE TABLE IF NOT EXISTS audit_logs (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TEXT    NOT NULL DEFAULT (datetime('now')),
			event_type TEXT    NOT NULL,
			user_addr  TEXT    NOT NULL DEFAULT '',
			chain_id   INTEGER NOT NULL DEFAULT 0,
			tx_hash    TEXT    NOT NULL DEFAULT '',
			status     TEXT    NOT NULL DEFAULT '',
			detail     TEXT    NOT NULL DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_audit_event   ON audit_logs(event_type);
		CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_addr);
		CREATE INDEX IF NOT EXISTS idx_audit_tx      ON audit_logs(tx_hash);
		CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
	`)
	return err
}

type AuditEntry struct {
	EventType string
	UserAddr  string
	ChainID   int64
	TxHash    string
	Status    string
	Detail    map[string]interface{}
}

func Log(entry AuditEntry) {
	if auditDB == nil {
		return
	}
	detailJSON, _ := json.Marshal(entry.Detail)
	_, err := auditDB.Exec(
		`INSERT INTO audit_logs (event_type, user_addr, chain_id, tx_hash, status, detail) VALUES (?, ?, ?, ?, ?, ?)`,
		entry.EventType, entry.UserAddr, entry.ChainID, entry.TxHash, entry.Status, string(detailJSON),
	)
	if err != nil {
		log.Printf("[AUDIT-DB] write error: %v", err)
	}
}

type AuditRecord struct {
	ID        int64  `json:"id"`
	CreatedAt string `json:"createdAt"`
	EventType string `json:"eventType"`
	UserAddr  string `json:"userAddr"`
	ChainID   int64  `json:"chainId"`
	TxHash    string `json:"txHash"`
	Status    string `json:"status"`
	Detail    string `json:"detail"`
}

type QueryParams struct {
	EventType string
	UserAddr  string
	TxHash    string
	Limit     int
	Offset    int
}

func Query(params QueryParams) ([]AuditRecord, int, error) {
	if auditDB == nil {
		return nil, 0, nil
	}
	if params.Limit <= 0 || params.Limit > 200 {
		params.Limit = 50
	}

	where := "1=1"
	args := []interface{}{}
	if params.EventType != "" {
		where += " AND event_type = ?"
		args = append(args, params.EventType)
	}
	if params.UserAddr != "" {
		where += " AND user_addr = ?"
		args = append(args, params.UserAddr)
	}
	if params.TxHash != "" {
		where += " AND tx_hash = ?"
		args = append(args, params.TxHash)
	}

	var total int
	countArgs := make([]interface{}, len(args))
	copy(countArgs, args)
	err := auditDB.QueryRow("SELECT COUNT(*) FROM audit_logs WHERE "+where, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	args = append(args, params.Limit, params.Offset)
	rows, err := auditDB.Query(
		"SELECT id, created_at, event_type, user_addr, chain_id, tx_hash, status, detail FROM audit_logs WHERE "+where+" ORDER BY id DESC LIMIT ? OFFSET ?",
		args...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []AuditRecord
	for rows.Next() {
		var r AuditRecord
		if err := rows.Scan(&r.ID, &r.CreatedAt, &r.EventType, &r.UserAddr, &r.ChainID, &r.TxHash, &r.Status, &r.Detail); err != nil {
			return nil, 0, err
		}
		records = append(records, r)
	}
	return records, total, nil
}

func GetStats() map[string]interface{} {
	if auditDB == nil {
		return nil
	}
	stats := map[string]interface{}{}

	var total int
	auditDB.QueryRow("SELECT COUNT(*) FROM audit_logs").Scan(&total)
	stats["totalLogs"] = total

	rows, err := auditDB.Query("SELECT event_type, COUNT(*) FROM audit_logs GROUP BY event_type ORDER BY COUNT(*) DESC")
	if err == nil {
		defer rows.Close()
		byType := map[string]int{}
		for rows.Next() {
			var t string
			var c int
			rows.Scan(&t, &c)
			byType[t] = c
		}
		stats["byEventType"] = byType
	}

	today := time.Now().Format("2006-01-02")
	var todayCount int
	auditDB.QueryRow("SELECT COUNT(*) FROM audit_logs WHERE created_at >= ?", today).Scan(&todayCount)
	stats["todayLogs"] = todayCount

	return stats
}

func Close() {
	if auditDB != nil {
		auditDB.Close()
	}
}
