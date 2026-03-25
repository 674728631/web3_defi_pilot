package services

import (
	"fmt"
	"log"
	"math/big"
	"strings"

	"defi-pilot-backend/config"
	abiPkg "defi-pilot-backend/contracts"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"golang.org/x/net/context"
)

// BuildOnChainContext queries real chain data for AI prompt injection
func BuildOnChainContext(userAddr string, chainID int64) string {
	chainCfg := config.GetChain(chainID)
	if chainCfg == nil {
		return fmt.Sprintf("Chain %d not supported", chainID)
	}

	client, err := ethclient.Dial(chainCfg.RPCURL)
	if err != nil {
		log.Printf("[CONTEXT] RPC connection failed: %v", err)
		return "Unable to connect to chain"
	}
	defer client.Close()

	ctx := context.Background()
	user := common.HexToAddress(userAddr)

	// 1. Query native ETH wallet balance (real on-chain data)
	walletBalance, err := client.BalanceAt(ctx, user, nil)
	if err != nil {
		log.Printf("[CONTEXT] Failed to get wallet balance: %v", err)
		walletBalance = big.NewInt(0)
	}
	walletETH := weiToETH(walletBalance)

	// 2. Query Vault balance (real on-chain, returns 0 if vault not deployed)
	vaultBalance := big.NewInt(0)
	posCount := big.NewInt(0)

	isVaultDeployed := chainCfg.Vault != "" &&
		chainCfg.Vault != "0x0000000000000000000000000000000000000000"

	if isVaultDeployed {
		vaultABI, err := abi.JSON(strings.NewReader(abiPkg.VaultABI))
		if err == nil {
			vaultAddr := common.HexToAddress(chainCfg.Vault)

			// getUserBalance
			if data, err := vaultABI.Pack("getUserBalance", user); err == nil {
				if result, err := client.CallContract(ctx, makeCallMsg(vaultAddr, data), nil); err == nil && len(result) >= 32 {
					vaultBalance.SetBytes(result[:32])
				}
			}

			// getUserPositionCount
			if data, err := vaultABI.Pack("getUserPositionCount", user); err == nil {
				if result, err := client.CallContract(ctx, makeCallMsg(vaultAddr, data), nil); err == nil && len(result) >= 32 {
					posCount.SetBytes(result[:32])
				}
			}
		}
	}

	vaultETH := weiToETH(vaultBalance)

	chainDisplayName := "Sepolia"
	if chainID == 421614 {
		chainDisplayName = "Arbitrum Sepolia"
	}

	result := fmt.Sprintf("用户链上状态 (%s, chainId=%d):\n"+
		"- 钱包 ETH 余额: %s ETH\n"+
		"- Vault 可用余额: %s ETH\n"+
		"- 活跃持仓: %d 个",
		chainDisplayName, chainID, walletETH, vaultETH, posCount.Int64())

	if !isVaultDeployed {
		result += "\n- (Vault 合约尚未部署)"
	}

	log.Printf("[CONTEXT] %s", result)
	return result
}

func weiToETH(wei *big.Int) string {
	f := new(big.Float).Quo(new(big.Float).SetInt(wei), new(big.Float).SetFloat64(1e18))
	return f.Text('f', 6)
}

func makeCallMsg(to common.Address, data []byte) ethereum.CallMsg {
	return ethereum.CallMsg{To: &to, Data: data}
}
