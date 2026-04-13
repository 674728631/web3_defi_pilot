package handlers

import (
	"net/http"
	"strconv"

	"defi-pilot-backend/db"

	"github.com/gin-gonic/gin"
)

// GET /api/index/stats — 全局统计数据
func HandleIndexStats(c *gin.Context) {
	stats := db.GetVaultStats()
	if stats == nil {
		c.JSON(http.StatusOK, gin.H{"error": "no data"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GET /api/index/users?limit=50&offset=0 — 所有用户列表
func HandleIndexUsers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	users, total, err := db.GetAllIndexedUsers(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"users": users,
		"total": total,
		"limit": limit,
		"offset": offset,
	})
}

// GET /api/index/user/:address — 单个用户详情
func HandleIndexUser(c *gin.Context) {
	address := c.Param("address")
	user, err := db.GetIndexedUser(address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	positions, _ := db.GetPositionsByUser(address)

	c.JSON(http.StatusOK, gin.H{
		"user":      user,
		"positions": positions,
	})
}

// GET /api/index/events?type=Deposited&user=0x...&limit=50&offset=0 — 事件列表
func HandleIndexEvents(c *gin.Context) {
	eventType := c.Query("type")
	userAddr := c.Query("user")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	events, total, err := db.GetIndexedEvents(eventType, userAddr, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GET /api/index/positions/:address — 用户持仓列表
func HandleIndexPositions(c *gin.Context) {
	address := c.Param("address")
	positions, err := db.GetPositionsByUser(address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"positions": positions,
	})
}
