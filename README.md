# Rootstock EventLens

EventLens is a transaction log explorer for Rootstock. Paste a transaction hash, fetch the receipt via RPC, and see a clean, human-readable, filterable list of all emitted events (including those from nested/internal calls that surface as logs in the receipt).

## Features

- Fetches `eth_getTransactionReceipt` and extracts raw `logs`
- Resolves ABIs per emitting contract address via Blockscout `getabi`
- Decodes event topics + data using `ethers.Interface`
- Filter by event name, contract, and free-text search (address/params/topics)
- Local caching of ABIs and basic contract metadata (name/symbol) in `localStorage`

## Quickstart

```bash
npm install
npm run dev
```

Open http://localhost:5173/

## Usage

- Select a network (Rootstock Mainnet/Testnet)
- Paste a transaction hash (0x + 64 hex chars)
- Click “Inspect”
- Use filters to focus on a specific event (e.g. `Transfer`) or contract

## Configuration

The UI exposes both endpoints so you can override them if needed:

- **RPC URL**
  - Mainnet default: `https://public-node.rsk.co`
  - Testnet default: `https://public-node.testnet.rsk.co`
- **ABI Source (Blockscout API)**
  - Mainnet default: `https://rootstock.blockscout.com/api`
  - Testnet default: `https://rootstock-testnet.blockscout.com/api`

Network chain IDs:

- Rootstock Mainnet: `30`
- Rootstock Testnet: `31`

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Notes / Limitations

- Event decoding depends on ABI availability from Blockscout; unverified contracts may show as “ABI unavailable”.
- “Unknown” events can still be inspected via raw topics/data in the expanded row.
- Contract name/symbol are fetched via `eth_call` (`name()`/`symbol()`) when possible and are used for display only.
- This app calls RPC and Blockscout directly from the browser. If your RPC endpoint blocks cross-origin requests, use a different RPC or a small proxy.

## Tech Stack

- React + TypeScript + Vite
- `ethers` for log decoding

## Deploy

This is a static frontend:

```bash
npm run build
```

Deploy the `dist/` folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel static, etc.).
