package services

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

const (
	coingeckoURL     = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
	priceCacheTTL    = 5 * time.Minute
	fallbackETHPrice = 3650.0
)

var (
	cachedPrice    float64
	cacheUpdatedAt time.Time
	priceMu        sync.RWMutex
	priceClient    = &http.Client{Timeout: 10 * time.Second}
)

type coingeckoResponse struct {
	Ethereum struct {
		USD float64 `json:"usd"`
	} `json:"ethereum"`
}

func GetETHPrice() float64 {
	priceMu.RLock()
	if cachedPrice > 0 && time.Since(cacheUpdatedAt) < priceCacheTTL {
		p := cachedPrice
		priceMu.RUnlock()
		return p
	}
	priceMu.RUnlock()

	priceMu.Lock()
	defer priceMu.Unlock()

	if cachedPrice > 0 && time.Since(cacheUpdatedAt) < priceCacheTTL {
		return cachedPrice
	}

	resp, err := priceClient.Get(coingeckoURL)
	if err != nil {
		log.Printf("[PRICE] CoinGecko request failed: %v", err)
		if cachedPrice > 0 {
			return cachedPrice
		}
		return fallbackETHPrice
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[PRICE] CoinGecko returned status %d", resp.StatusCode)
		if cachedPrice > 0 {
			return cachedPrice
		}
		return fallbackETHPrice
	}

	var result coingeckoResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[PRICE] CoinGecko decode failed: %v", err)
		if cachedPrice > 0 {
			return cachedPrice
		}
		return fallbackETHPrice
	}

	if result.Ethereum.USD > 0 {
		cachedPrice = result.Ethereum.USD
		cacheUpdatedAt = time.Now()
		log.Printf("[PRICE] ETH/USD updated: $%.2f", cachedPrice)
	}

	if cachedPrice > 0 {
		return cachedPrice
	}
	return fallbackETHPrice
}
