package services

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

const (
	cryptoCompareURL = "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD"
	coingeckoURL     = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
	priceCacheTTL    = 5 * time.Minute
	fallbackETHPrice = 2000.0
)

var (
	cachedPrice    float64
	cacheUpdatedAt time.Time
	priceMu        sync.RWMutex
	priceClient    = &http.Client{Timeout: 8 * time.Second}
)

type cryptoCompareResponse struct {
	USD float64 `json:"USD"`
}

type coingeckoResponse struct {
	Ethereum struct {
		USD float64 `json:"usd"`
	} `json:"ethereum"`
}

type priceSource struct {
	name  string
	fetch func() (float64, error)
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

	sources := []priceSource{
		{name: "CryptoCompare", fetch: fetchCryptoCompare},
		{name: "CoinGecko", fetch: fetchCoinGecko},
	}

	for _, src := range sources {
		price, err := src.fetch()
		if err != nil {
			log.Printf("[PRICE] %s failed: %v", src.name, err)
			continue
		}
		if price > 0 {
			cachedPrice = price
			cacheUpdatedAt = time.Now()
			log.Printf("[PRICE] ETH/USD updated via %s: $%.2f", src.name, cachedPrice)
			return cachedPrice
		}
	}

	log.Printf("[PRICE] All sources failed, using cached or fallback")
	if cachedPrice > 0 {
		return cachedPrice
	}
	return fallbackETHPrice
}

func fetchCryptoCompare() (float64, error) {
	resp, err := priceClient.Get(cryptoCompareURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("status %d", resp.StatusCode)
	}

	var result cryptoCompareResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}
	return result.USD, nil
}

func fetchCoinGecko() (float64, error) {
	resp, err := priceClient.Get(coingeckoURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("status %d", resp.StatusCode)
	}

	var result coingeckoResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}
	return result.Ethereum.USD, nil
}
