export type Hex = `0x${string}`

export type RpcLog = {
  address: Hex
  topics: Hex[]
  data: Hex
  blockNumber: Hex
  transactionHash: Hex
  transactionIndex: Hex
  blockHash: Hex
  logIndex: Hex
  removed: boolean
}

export type RpcTransactionReceipt = {
  transactionHash: Hex
  transactionIndex: Hex
  blockHash: Hex
  blockNumber: Hex
  from: Hex
  to: Hex | null
  cumulativeGasUsed: Hex
  gasUsed: Hex
  contractAddress: Hex | null
  logs: RpcLog[]
  logsBloom: Hex
  status?: Hex
  effectiveGasPrice?: Hex
  type?: Hex
}

type JsonRpcSuccess<T> = { jsonrpc: '2.0'; id: number; result: T }
type JsonRpcFailure = {
  jsonrpc: '2.0'
  id: number
  error: { code: number; message: string; data?: unknown }
}

export async function jsonRpcRequest<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1_000_000_000),
      method,
      params,
    }),
    signal,
  })

  const json = (await response.json()) as JsonRpcSuccess<T> | JsonRpcFailure

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`)
  }

  if ('error' in json) {
    throw new Error(json.error.message || `RPC error ${json.error.code}`)
  }

  return json.result
}

export async function getTransactionReceipt(
  rpcUrl: string,
  txHash: Hex,
  signal?: AbortSignal,
): Promise<RpcTransactionReceipt | null> {
  return jsonRpcRequest<RpcTransactionReceipt | null>(
    rpcUrl,
    'eth_getTransactionReceipt',
    [txHash],
    signal,
  )
}

export async function ethCall(
  rpcUrl: string,
  to: Hex,
  data: Hex,
  blockTag: 'latest' | Hex = 'latest',
  signal?: AbortSignal,
): Promise<Hex> {
  return jsonRpcRequest<Hex>(
    rpcUrl,
    'eth_call',
    [{ to, data }, blockTag],
    signal,
  )
}

