import type { Hex } from './rpc'
import { ethCall } from './rpc'
import { safeGetLocalStorageItem, safeSetLocalStorageItem } from './storage'

export type ContractMeta = {
  name?: string
  symbol?: string
}

function metaCacheKey(chainId: number, address: Hex): string {
  return `eventlens:meta:${chainId}:${address.toLowerCase()}`
}

function decodeAbiString(data: Hex): string | undefined {
  if (data === '0x') return undefined
  const hex = data.slice(2)
  if (hex.length < 64) return undefined

  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`))
  const offsetStart = offset * 2
  if (offsetStart + 64 > hex.length) return undefined

  const length = Number(BigInt(`0x${hex.slice(offsetStart, offsetStart + 64)}`))
  const dataStart = offsetStart + 64
  const dataEnd = dataStart + length * 2
  if (dataEnd > hex.length) return undefined

  const bytesHex = hex.slice(dataStart, dataEnd)
  const bytes = new Uint8Array(bytesHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(bytesHex.slice(i * 2, i * 2 + 2), 16)
  }
  try {
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

export function getCachedContractMeta(chainId: number, address: Hex): ContractMeta | null {
  const cached = safeGetLocalStorageItem(metaCacheKey(chainId, address))
  if (!cached) return null
  try {
    return JSON.parse(cached) as ContractMeta
  } catch {
    return null
  }
}

export function setCachedContractMeta(chainId: number, address: Hex, meta: ContractMeta): void {
  safeSetLocalStorageItem(metaCacheKey(chainId, address), JSON.stringify(meta))
}

export async function fetchContractMeta(
  rpcUrl: string,
  chainId: number,
  address: Hex,
  signal?: AbortSignal,
): Promise<ContractMeta> {
  const cached = getCachedContractMeta(chainId, address)
  if (cached) return cached

  const [symbolData, nameData] = await Promise.allSettled([
    ethCall(rpcUrl, address, '0x95d89b41', 'latest', signal),
    ethCall(rpcUrl, address, '0x06fdde03', 'latest', signal),
  ])

  const meta: ContractMeta = {}

  if (symbolData.status === 'fulfilled') meta.symbol = decodeAbiString(symbolData.value)
  if (nameData.status === 'fulfilled') meta.name = decodeAbiString(nameData.value)

  setCachedContractMeta(chainId, address, meta)
  return meta
}

