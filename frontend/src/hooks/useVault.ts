import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import { getContracts } from '@/utils/contracts'
import VaultAbi from '@/abi/DeFiPilotVault.json'

export function useVault() {
  const { address } = useAccount()
  const chainId = useChainId()
  const contracts = getContracts(chainId)
  const isValidVault = contracts.vault !== '0x0000000000000000000000000000000000000000'

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: contracts.vault,
    abi: VaultAbi,
    functionName: 'getUserBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isValidVault },
  })

  const { data: positionCount, refetch: refetchPositions } = useReadContract({
    address: contracts.vault,
    abi: VaultAbi,
    functionName: 'getUserPositionCount',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isValidVault },
  })

  const { data: healthFactor } = useReadContract({
    address: contracts.vault,
    abi: VaultAbi,
    functionName: 'getHealthFactor',
    query: { enabled: isValidVault },
  })

  const { writeContract: writeDeposit, data: depositHash, isPending: isDepositing } = useWriteContract()
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawing } = useWriteContract()
  const { writeContract: writeDepositAndExecute, data: execHash, isPending: isExecuting } = useWriteContract()
  const { writeContract: writeWithdrawFromProtocol, data: withdrawProtocolHash, isPending: isWithdrawingProtocol } = useWriteContract()

  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({ hash: depositHash })
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash })
  const { isLoading: isExecConfirming, isSuccess: isExecSuccess } = useWaitForTransactionReceipt({ hash: execHash })
  const { isLoading: isWithdrawProtocolConfirming, isSuccess: isWithdrawProtocolSuccess } = useWaitForTransactionReceipt({ hash: withdrawProtocolHash })

  const deposit = (ethAmount: string) => {
    writeDeposit({
      address: contracts.vault,
      abi: VaultAbi,
      functionName: 'deposit',
      value: parseEther(ethAmount),
    })
  }

  const withdraw = (ethAmount: string) => {
    writeWithdraw({
      address: contracts.vault,
      abi: VaultAbi,
      functionName: 'withdraw',
      args: [parseEther(ethAmount)],
    })
  }

  const depositAndExecute = (protocol: string, ethAmount: string) => {
    writeDepositAndExecute({
      address: contracts.vault,
      abi: VaultAbi,
      functionName: 'depositAndExecute',
      args: [protocol],
      value: parseEther(ethAmount),
    })
  }

  const withdrawFromProtocol = (positionId: bigint) => {
    writeWithdrawFromProtocol({
      address: contracts.vault,
      abi: VaultAbi,
      functionName: 'withdrawFromProtocol',
      args: [positionId],
    })
  }

  return {
    balance: balance as bigint | undefined,
    positionCount: positionCount as bigint | undefined,
    healthFactor: healthFactor as [bigint, bigint, boolean] | undefined,
    deposit,
    withdraw,
    depositAndExecute,
    withdrawFromProtocol,
    isDepositing: isDepositing || isDepositConfirming,
    isWithdrawing: isWithdrawing || isWithdrawConfirming,
    isExecuting: isExecuting || isExecConfirming,
    isWithdrawingProtocol: isWithdrawingProtocol || isWithdrawProtocolConfirming,
    isDepositSuccess,
    isWithdrawSuccess,
    isExecSuccess,
    isWithdrawProtocolSuccess,
    refetchBalance,
    refetchPositions,
  }
}
