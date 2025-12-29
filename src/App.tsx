import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAbiFromBlockscout, getCachedAbi, setCachedAbi, type ContractAbi } from './lib/abi'
import { fetchContractMeta, type ContractMeta } from './lib/contractMeta'
import { decodeLogWithAbi, type DecodedEvent } from './lib/decode'
import { formatUnknown, hexToNumber, isValidTxHash, shortenHex } from './lib/format'
import { NETWORKS, type NetworkConfig } from './lib/networks'
import { getTransactionReceipt, type Hex, type RpcTransactionReceipt } from './lib/rpc'

function App() {
  const [networkId, setNetworkId] = useState<NetworkConfig['id']>('rootstock-mainnet')
  const [rpcUrl, setRpcUrl] = useState<string>(NETWORKS[0].rpcUrl)
  const [blockscoutApiBaseUrl, setBlockscoutApiBaseUrl] = useState<string>(
    NETWORKS[0].blockscoutApiBaseUrl,
  )

  const [txHashInput, setTxHashInput] = useState<string>('')
  const [txHash, setTxHash] = useState<Hex | null>(null)

  const [receipt, setReceipt] = useState<RpcTransactionReceipt | null>(null)
  const [decodedEvents, setDecodedEvents] = useState<DecodedEvent[] | null>(null)
  const [abisByAddress, setAbisByAddress] = useState<Record<string, ContractAbi | null>>({})
  const [metaByAddress, setMetaByAddress] = useState<Record<string, ContractMeta>>({})

  const [eventNameFilter, setEventNameFilter] = useState<string>('')
  const [contractFilter, setContractFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeRequestRef = useRef<AbortController | null>(null)

  const selectedNetwork = useMemo(
    () => NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0],
    [networkId],
  )

  useEffect(() => {
    setRpcUrl(selectedNetwork.rpcUrl)
    setBlockscoutApiBaseUrl(selectedNetwork.blockscoutApiBaseUrl)
  }, [selectedNetwork])

  const getContractLabel = useCallback((address: Hex): string => {
    const meta = metaByAddress[address.toLowerCase()]
    if (meta?.symbol) return `${meta.symbol} (${shortenHex(address)})`
    return shortenHex(address)
  }, [metaByAddress])

  async function mapWithLimit<TIn, TOut>(
    items: readonly TIn[],
    limit: number,
    mapper: (item: TIn, index: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    const results: TOut[] = new Array(items.length)
    let nextIndex = 0

    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (nextIndex < items.length) {
        const current = nextIndex
        nextIndex += 1
        results[current] = await mapper(items[current], current)
      }
    })

    await Promise.all(workers)
    return results
  }

  async function load(txHashToLoad: Hex): Promise<void> {
    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller

    setIsLoading(true)
    setErrorMessage(null)
    setReceipt(null)
    setDecodedEvents(null)
    setAbisByAddress({})
    setMetaByAddress({})
    setEventNameFilter('')
    setContractFilter('')
    setSearchQuery('')

    try {
      const result = await getTransactionReceipt(rpcUrl, txHashToLoad, controller.signal)
      if (!result) throw new Error('Transaction receipt not found')
      setReceipt(result)

      const logs = [...result.logs].sort((a, b) => Number(BigInt(a.logIndex) - BigInt(b.logIndex)))
      const uniqueAddresses = Array.from(
        new Set(logs.map((l) => l.address.toLowerCase())),
      ) as Hex[]

      const abiEntries = await mapWithLimit(uniqueAddresses, 4, async (address) => {
        const cached = getCachedAbi(selectedNetwork.chainId, address)
        if (cached) return [address, cached] as const

        const fetched = await fetchAbiFromBlockscout(
          blockscoutApiBaseUrl,
          address,
          controller.signal,
        )
        if (fetched) setCachedAbi(selectedNetwork.chainId, address, fetched)
        return [address, fetched] as const
      })

      const abiMap: Record<string, ContractAbi | null> = {}
      for (const [address, abi] of abiEntries) abiMap[address.toLowerCase()] = abi
      setAbisByAddress(abiMap)

      const decoded = logs.map((log) => {
        const abi = abiMap[log.address.toLowerCase()]
        if (!abi) {
          const logIndex = Number(BigInt(log.logIndex))
          const transactionIndex = Number(BigInt(log.transactionIndex))
          return {
            address: log.address,
            logIndex,
            transactionIndex,
            eventName: null,
            params: null,
            topics: log.topics,
            data: log.data,
          }
        }
        return decodeLogWithAbi(log, abi)
      })

      setDecodedEvents(decoded)

      const metaEntries = await mapWithLimit(uniqueAddresses, 4, async (address) => {
        const meta = await fetchContractMeta(
          rpcUrl,
          selectedNetwork.chainId,
          address,
          controller.signal,
        )
        return [address, meta] as const
      })

      const metaMap: Record<string, ContractMeta> = {}
      for (const [address, meta] of metaEntries) metaMap[address.toLowerCase()] = meta
      setMetaByAddress(metaMap)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Unknown error'
      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!isValidTxHash(txHashInput.trim())) {
      setErrorMessage('Invalid transaction hash')
      return
    }
    const value = txHashInput.trim() as Hex
    setTxHash(value)
    void load(value)
  }

  const contractOptions = useMemo(() => {
    if (!decodedEvents) return []
    const addresses = Array.from(new Set(decodedEvents.map((e) => e.address.toLowerCase())))
    return addresses.sort()
  }, [decodedEvents])

  const eventNameOptions = useMemo(() => {
    if (!decodedEvents) return []
    const names = new Set<string>()
    for (const e of decodedEvents) if (e.eventName) names.add(e.eventName)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [decodedEvents])

  const filteredEvents = useMemo(() => {
    if (!decodedEvents) return null
    const q = searchQuery.trim().toLowerCase()
    return decodedEvents.filter((e) => {
      if (eventNameFilter && e.eventName !== eventNameFilter) return false
      if (contractFilter && e.address.toLowerCase() !== contractFilter.toLowerCase()) return false
      if (!q) return true

      const label = getContractLabel(e.address).toLowerCase()
      const name = (e.eventName ?? '').toLowerCase()
      const params = e.params?.map((p) => `${p.name}:${formatUnknown(p.value)}`).join(' ') ?? ''

      return (
        e.address.toLowerCase().includes(q) ||
        label.includes(q) ||
        name.includes(q) ||
        params.toLowerCase().includes(q) ||
        e.topics.join(' ').toLowerCase().includes(q)
      )
    })
  }, [decodedEvents, eventNameFilter, contractFilter, searchQuery, getContractLabel])

  const receiptSummary = useMemo(() => {
    if (!receipt) return null
    const status = receipt.status ? hexToNumber(receipt.status) : null
    return {
      blockNumber: hexToNumber(receipt.blockNumber),
      gasUsed: hexToNumber(receipt.gasUsed),
      status,
      logCount: receipt.logs.length,
    }
  }, [receipt])

  return (
    <div className="page">
      <header className="header">
        <div className="header__title">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true" />
            Rootstock EventLens
          </div>
          <div className="subtitle">Transaction Log Explorer</div>
        </div>
        <div className="header__meta">
          <div className="badge">Chain ID {selectedNetwork.chainId}</div>
          <a
            className="link"
            href="https://rootstock.blockscout.com/"
            target="_blank"
            rel="noreferrer"
          >
            Blockscout
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="hero__card">
          <div className="hero__headline">Decode what actually happened</div>
          <div className="hero__desc">
            Fetch a receipt, resolve contract ABIs, and decode every event emitted by the transaction.
          </div>
          <div className="hero__pills">
            <div className="pill">Logs</div>
            <div className="pill">Topics</div>
            <div className="pill">ABI decode</div>
            <div className="pill">Filters</div>
          </div>
        </div>
      </section>

      <section className="panel panel--primary">
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <div className="field__label">Network</div>
            <select
              className="input"
              value={networkId}
              onChange={(e) => setNetworkId(e.target.value as NetworkConfig['id'])}
            >
              {NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--grow">
            <div className="field__label">RPC URL</div>
            <input className="input" value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
          </label>

          <label className="field field--grow">
            <div className="field__label">ABI Source (Blockscout API)</div>
            <input
              className="input"
              value={blockscoutApiBaseUrl}
              onChange={(e) => setBlockscoutApiBaseUrl(e.target.value)}
            />
          </label>

          <label className="field field--grow">
            <div className="field__label">Transaction Hash</div>
            <input
              className="input input--mono"
              placeholder="0x…"
              value={txHashInput}
              onChange={(e) => setTxHashInput(e.target.value)}
            />
          </label>

          <div className="field field--actions">
            <div className="field__label">&nbsp;</div>
            <button className="button" disabled={isLoading}>
              {isLoading ? 'Loading…' : 'Inspect'}
            </button>
          </div>
        </form>

        {errorMessage ? <div className="error">{errorMessage}</div> : null}

        {receiptSummary ? (
          <div className="summary">
            <div className="summary__item">
              <div className="summary__k">Tx</div>
              <div className="summary__v mono">{txHash ? shortenHex(txHash, 10, 8) : ''}</div>
            </div>
            <div className="summary__item">
              <div className="summary__k">Block</div>
              <div className="summary__v">{receiptSummary.blockNumber}</div>
            </div>
            <div className="summary__item">
              <div className="summary__k">Status</div>
              <div className="summary__v">
                {receiptSummary.status === null ? '—' : receiptSummary.status === 1 ? 'Success' : 'Revert'}
              </div>
            </div>
            <div className="summary__item">
              <div className="summary__k">Gas Used</div>
              <div className="summary__v">{receiptSummary.gasUsed.toLocaleString()}</div>
            </div>
            <div className="summary__item">
              <div className="summary__k">Logs</div>
              <div className="summary__v">{receiptSummary.logCount}</div>
            </div>
          </div>
        ) : null}
      </section>

      {decodedEvents ? (
        <section className="panel panel--secondary">
          <div className="filters">
            <label className="field">
              <div className="field__label">Event</div>
              <select
                className="input"
                value={eventNameFilter}
                onChange={(e) => setEventNameFilter(e.target.value)}
              >
                <option value="">All</option>
                {eventNameOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--grow">
              <div className="field__label">Contract</div>
              <select
                className="input"
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value)}
              >
                <option value="">All</option>
                {contractOptions.map((address) => (
                  <option key={address} value={address}>
                    {getContractLabel(address as Hex)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--grow">
              <div className="field__label">Search</div>
              <input
                className="input"
                placeholder="Event, address, parameter, topic…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="table">
            <div className="table__head">
              <div className="cell cell--idx">#</div>
              <div className="cell cell--contract">Contract</div>
              <div className="cell cell--event">Event</div>
              <div className="cell cell--params">Parameters</div>
            </div>

            {(filteredEvents ?? []).length === 0 ? (
              <div className="empty">No events match your filters.</div>
            ) : (
              (filteredEvents ?? []).map((e) => (
                <details className="row" key={`${e.transactionIndex}:${e.logIndex}`}>
                  <summary className="row__summary">
                    <div className="cell cell--idx">{e.logIndex}</div>
                    <div className="cell cell--contract">
                      <span className="mono">{getContractLabel(e.address)}</span>
                    </div>
                    <div className="cell cell--event">
                      {e.eventName ? (
                        <span className="eventTag">{e.eventName}</span>
                      ) : (
                        <span className="eventTag eventTag--unknown">Unknown</span>
                      )}
                    </div>
                    <div className="cell cell--params">
                      {e.params ? (
                        <span className="mono">
                          {e.params
                            .slice(0, 4)
                            .map((p) => `${p.name}: ${formatUnknown(p.value)}`)
                            .join(' · ')}
                          {e.params.length > 4 ? ' · …' : ''}
                        </span>
                      ) : (
                        <span className="muted">
                          {abisByAddress[e.address.toLowerCase()] ? 'No matching event in ABI' : 'ABI unavailable'}
                        </span>
                      )}
                    </div>
                  </summary>

                  <div className="row__details">
                    <div className="detailGrid">
                      <div className="detailGrid__k">Emitter</div>
                      <div className="detailGrid__v mono">{e.address}</div>

                      <div className="detailGrid__k">ABI</div>
                      <div className="detailGrid__v">
                        {abisByAddress[e.address.toLowerCase()] ? 'Resolved' : 'Missing'}
                      </div>

                      <div className="detailGrid__k">Topics</div>
                      <div className="detailGrid__v mono">
                        {e.topics.map((t) => (
                          <div key={t}>{t}</div>
                        ))}
                      </div>

                      <div className="detailGrid__k">Data</div>
                      <div className="detailGrid__v mono">{e.data}</div>

                      {e.params ? (
                        <>
                          <div className="detailGrid__k">Decoded</div>
                          <div className="detailGrid__v">
                            <div className="paramTable">
                              {e.params.map((p) => (
                                <div className="paramRow" key={`${p.name}:${p.type}`}>
                                  <div className="paramRow__k mono">{p.name}</div>
                                  <div className="paramRow__t mono">{p.type}</div>
                                  <div className="paramRow__v mono">{formatUnknown(p.value)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      ) : null}

      <footer className="footer">
        <div className="muted">
          Tip: paste a tx hash, then filter by event name like <span className="mono">Transfer</span>.
        </div>
      </footer>
    </div>
  )
}

export default App
