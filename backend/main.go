package main

import (
	"log"
	"path/filepath"
	"time"

	"defi-pilot-backend/config"
	"defi-pilot-backend/db"
	"defi-pilot-backend/handlers"
	"defi-pilot-backend/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	config.Load()
	services.InitRegistry()

	dbPath := filepath.Join(".", "audit.db")
	db.Init(dbPath)
	db.InitIndexer()
	defer db.Close()

	// 启动链下事件索引协程（Sepolia）
	services.StartIndexer(11155111)

	r := gin.Default()

	// CORS: allow frontend origin
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{config.C.FrontendOrigin, "http://localhost:5173", "http://localhost:5174"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	api := r.Group("/api")
	{
		api.POST("/chat", handlers.HandleChat)
		api.POST("/execute", handlers.HandleExecute)
		api.GET("/tx/:hash", handlers.HandleTxStatus)
		api.GET("/health/vault", handlers.HandleVaultHealth)
		api.GET("/vault/balance", handlers.HandleVaultBalance)
		api.GET("/portfolio", handlers.HandlePortfolio)
		api.GET("/opportunities", handlers.HandleOpportunities)
		api.GET("/price/eth", func(c *gin.Context) {
			price := services.GetETHPrice()
			c.JSON(200, gin.H{"symbol": "ETH", "usd": price})
		})
		api.GET("/audit/logs", handlers.HandleAuditLogs)
		api.GET("/audit/stats", handlers.HandleAuditStats)
		api.GET("/health/chains", handlers.HandleChainsHealth)

		// 链下索引 API
		idx := api.Group("/index")
		{
			idx.GET("/stats", handlers.HandleIndexStats)
			idx.GET("/users", handlers.HandleIndexUsers)
			idx.GET("/user/:address", handlers.HandleIndexUser)
			idx.GET("/events", handlers.HandleIndexEvents)
			idx.GET("/positions/:address", handlers.HandleIndexPositions)
		}
	}

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "defi-pilot-backend"})
	})

	log.Printf("DeFi Pilot backend starting on :%s", config.C.Port)
	if err := r.Run(":" + config.C.Port); err != nil {
		log.Fatal("Server failed to start: ", err)
	}
}
