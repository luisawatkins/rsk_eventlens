export type NetworkConfig = {
  id: 'rootstock-mainnet' | 'rootstock-testnet'
  label: string
  chainId: number
  rpcUrl: string
  blockscoutApiBaseUrl: string
}

export const NETWORKS: readonly NetworkConfig[] = [
  {
    id: 'rootstock-mainnet',
    label: 'Rootstock Mainnet',
    chainId: 30,
    rpcUrl: 'https://public-node.rsk.co',
    blockscoutApiBaseUrl: 'https://rootstock.blockscout.com/api',
  },
  {
    id: 'rootstock-testnet',
    label: 'Rootstock Testnet',
    chainId: 31,
    rpcUrl: 'https://public-node.testnet.rsk.co',
    blockscoutApiBaseUrl: 'https://rootstock-testnet.blockscout.com/api',
  },
] as const

