package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// ChainConfig holds contract addresses and RPC for a specific chain
type ChainConfig struct {
	ChainID  int64
	RPCURL   string
	Vault    string
	Executor string
	Adapter  string
}

// Config holds all application configuration
type Config struct {
	Port           string
	FrontendOrigin string

	OpenAIKey     string
	OpenAIBaseURL string
	OpenAIModel   string

	SolverPrivateKey string

	Chains map[int64]*ChainConfig
}

var C *Config

func Load() {
	_ = godotenv.Load()

	C = &Config{
		Port:           getEnv("PORT", "3001"),
		FrontendOrigin: getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
		OpenAIKey:      os.Getenv("OPENAI_API_KEY"),
		OpenAIBaseURL:  getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		OpenAIModel:    getEnv("OPENAI_MODEL", "gpt-4o-mini"),

		SolverPrivateKey: os.Getenv("SOLVER_PRIVATE_KEY"),

		Chains: map[int64]*ChainConfig{
			// ===== Testnets (deployed) =====
			11155111: {
				ChainID:  11155111,
				RPCURL:   getEnv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org"),
				Vault:    getEnv("VAULT_ADDRESS_SEPOLIA", "0x0000000000000000000000000000000000000000"),
				Executor: getEnv("EXECUTOR_ADDRESS_SEPOLIA", "0x0000000000000000000000000000000000000000"),
				Adapter:  getEnv("ADAPTER_ADDRESS_SEPOLIA", "0x0000000000000000000000000000000000000000"),
			},
			421614: {
				ChainID:  421614,
				RPCURL:   getEnv("ARB_SEPOLIA_RPC_URL", "https://sepolia-rollup.arbitrum.io/rpc"),
				Vault:    getEnv("VAULT_ADDRESS_ARB", "0x0000000000000000000000000000000000000000"),
				Executor: getEnv("EXECUTOR_ADDRESS_ARB", "0x0000000000000000000000000000000000000000"),
				Adapter:  getEnv("ADAPTER_ADDRESS_ARB", "0x0000000000000000000000000000000000000000"),
			},
			// ===== Mainnets (monitoring only) =====
			1: {
				ChainID: 1,
				RPCURL:  getEnv("ETH_RPC_URL", "https://eth.drpc.org"),
			},
			42161: {
				ChainID: 42161,
				RPCURL:  getEnv("ARB_RPC_URL", "https://arb1.arbitrum.io/rpc"),
			},
			10: {
				ChainID: 10,
				RPCURL:  getEnv("OP_RPC_URL", "https://optimism.drpc.org"),
			},
			8453: {
				ChainID: 8453,
				RPCURL:  getEnv("BASE_RPC_URL", "https://mainnet.base.org"),
			},
			137: {
				ChainID: 137,
				RPCURL:  getEnv("POLYGON_RPC_URL", "https://polygon.drpc.org"),
			},
			43114: {
				ChainID: 43114,
				RPCURL:  getEnv("AVAX_RPC_URL", "https://api.avax.network/ext/bc/C/rpc"),
			},
		},
	}

	chainIDs := make([]int64, 0, len(C.Chains))
	for id := range C.Chains {
		chainIDs = append(chainIDs, id)
	}
	log.Printf("Config loaded: port=%s, chains=%v (%d total)", C.Port, chainIDs, len(chainIDs))
}

func GetChain(chainID int64) *ChainConfig {
	return C.Chains[chainID]
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
