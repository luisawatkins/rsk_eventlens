import { Interface } from 'ethers'
import type { ContractAbi } from './abi'
import type { Hex, RpcLog } from './rpc'

export type DecodedParam = {
  name: string
  type: string
  value: unknown
}

export type DecodedEvent = {
  address: Hex
  logIndex: number
  transactionIndex: number
  eventName: string | null
  params: DecodedParam[] | null
  topics: Hex[]
  data: Hex
}

export function decodeLogWithAbi(log: RpcLog, abi: ContractAbi): DecodedEvent {
  const logIndex = Number(BigInt(log.logIndex))
  const transactionIndex = Number(BigInt(log.transactionIndex))

  const base: DecodedEvent = {
    address: log.address,
    logIndex,
    transactionIndex,
    eventName: null,
    params: null,
    topics: log.topics,
    data: log.data,
  }

  try {
    const iface = new Interface(abi)
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
    if (!parsed) return base

    const params: DecodedParam[] = parsed.fragment.inputs.map((input, idx) => ({
      name: input.name || `arg${idx}`,
      type: input.type,
      value: parsed.args[idx],
    }))

    return { ...base, eventName: parsed.name, params }
  } catch {
    return base
  }
}
