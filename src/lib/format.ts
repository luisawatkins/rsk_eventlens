import type { Hex } from './rpc'

export function isValidTxHash(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value)
}

export function shortenHex(value: string, left = 6, right = 4): string {
  if (!value.startsWith('0x') || value.length <= left + right + 2) return value
  return `${value.slice(0, 2 + left)}…${value.slice(value.length - right)}`
}

export function hexToNumber(value: Hex): number {
  return Number(BigInt(value))
}

export function formatUnknown(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return value.toString(10)
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (Array.isArray(value)) return `[${value.map(formatUnknown).join(', ')}]`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

