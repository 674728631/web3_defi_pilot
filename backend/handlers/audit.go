package handlers

import (
	"net/http"
	"strconv"

	"defi-pilot-backend/db"

	"github.com/gin-gonic/gin"
)

func HandleAuditLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	params := db.QueryParams{
		EventType: c.Query("event"),
		UserAddr:  c.Query("user"),
		TxHash:    c.Query("tx"),
		Limit:     limit,
		Offset:    offset,
	}

	records, total, err := db.Query(params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total":   total,
		"records": records,
		"limit":   limit,
		"offset":  offset,
	})
}

func HandleAuditStats(c *gin.Context) {
	stats := db.GetStats()
	c.JSON(http.StatusOK, stats)
}
