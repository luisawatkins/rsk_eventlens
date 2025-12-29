import type { InterfaceAbi } from 'ethers'
import type { Hex } from './rpc'
import { safeGetLocalStorageItem, safeSetLocalStorageItem } from './storage'

export type ContractAbi = InterfaceAbi

type BlockscoutGetAbiResponse =
  | { status: '1'; message: string; result: string }
  | { status: '0'; message: string; result: string }

function abiCacheKey(chainId: number, address: Hex): string {
  return `eventlens:abi:${chainId}:${address.toLowerCase()}`
}

export function getCachedAbi(chainId: number, address: Hex): ContractAbi | null {
  const cached = safeGetLocalStorageItem(abiCacheKey(chainId, address))
  if (!cached) return null
  try {
    const parsed = JSON.parse(cached) as ContractAbi
    if (!(Array.isArray(parsed) || typeof parsed === 'string')) return null
    return parsed
  } catch {
    return null
  }
}

export function setCachedAbi(chainId: number, address: Hex, abi: ContractAbi): void {
  safeSetLocalStorageItem(abiCacheKey(chainId, address), JSON.stringify(abi))
}

export async function fetchAbiFromBlockscout(
  blockscoutApiBaseUrl: string,
  address: Hex,
  signal?: AbortSignal,
): Promise<ContractAbi | null> {
  const url = `${blockscoutApiBaseUrl}?module=contract&action=getabi&address=${address}`
  const response = await fetch(url, { signal })
  if (!response.ok) return null

  const json = (await response.json()) as BlockscoutGetAbiResponse
  if (!('result' in json)) return null
  if (json.status !== '1') return null

  try {
    const parsed = JSON.parse(json.result) as ContractAbi
    if (!(Array.isArray(parsed) || typeof parsed === 'string')) return null
    return parsed
  } catch {
    return null
  }
}
