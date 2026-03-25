package handlers

import (
	"net/http"
	"sort"

	"defi-pilot-backend/services"

	"github.com/gin-gonic/gin"
)

type OpportunityResponse struct {
	Protocol string  `json:"protocol"`
	ChainID  int64   `json:"chainId"`
	APY      float64 `json:"apy"`
	TVL      float64 `json:"tvl"`
	Risk     string  `json:"risk"`
	Audited  bool    `json:"audited"`
}

func HandleOpportunities(c *gin.Context) {
	protocols := services.GetProtocolsByRisk("High", 0)

	sort.Slice(protocols, func(i, j int) bool {
		return protocols[i].APY > protocols[j].APY
	})

	limit := 6
	if len(protocols) < limit {
		limit = len(protocols)
	}

	result := make([]OpportunityResponse, limit)
	for i := 0; i < limit; i++ {
		p := protocols[i]
		result[i] = OpportunityResponse{
			Protocol: p.Name,
			ChainID:  p.ChainID,
			APY:      p.APY,
			TVL:      p.TVL,
			Risk:     p.Risk,
			Audited:  p.Audited,
		}
	}

	c.JSON(http.StatusOK, gin.H{"opportunities": result})
}
