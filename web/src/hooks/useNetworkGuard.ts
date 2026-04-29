'use client'

import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { ogChain } from '@/lib/og-chain'

const CHAIN_ID_HEX = '0x' + ogChain.id.toString(16)

async function addAndSwitchTo0G() {
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
  if (!eth) return

  try {
    const currentChainId = await eth.request({ method: 'eth_chainId' }) as string
    if (currentChainId.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return

    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_ID_HEX,
        chainName: ogChain.name,
        nativeCurrency: ogChain.nativeCurrency,
        rpcUrls: [ogChain.rpcUrls.default.http[0]],
        blockExplorerUrls: [ogChain.blockExplorers?.default.url ?? ''],
      }],
    })
  } catch {
    // user rejected or wallet doesn't support — do nothing
  }
}

export function useNetworkGuard() {
  const { isConnected, isConnecting } = useAccount()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Don't fire while wallet connection is in progress — avoids "request cancelled"
    if (!isConnected || isConnecting) return

    // Small delay to let ConnectKit finish its own handshake before we send chain requests
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      addAndSwitchTo0G()
    }, 1500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isConnected, isConnecting])
}
