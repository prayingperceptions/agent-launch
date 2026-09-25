# Agent Launch

**Safe token deployment on Base with a transparent 0.5% mint-time protocol fee.**

A token deployed through Agent Launch is a standard EVM token with one addition: at
deployment, **0.5% of total supply is minted to the protocol recipient** — on-chain,
disclosed, and impossible to bypass. The rest goes to the deployer.

This is the **"Launch" pillar** of [Agent Stack](https://agentos-landing.vercel.app)
(identity → safety → permission → **launch** → custody): the integrity rail that makes
token launches safe and fee-bearing, *not* a sniper/front-run bot.

---

## Live on Base mainnet

| Contract | Address (Base) | Basescan |
|---|---|---|
| **FeeRegistry** (protocol fee rail) | `0x58e212C27D5db2f2aB031a062670468577caBDbf` | [view](https://basescan.org/address/0x58e212C27D5db2f2aB031a062670468577caBDbf) |
| **Token (AST)** (deployed example) | `0x8A338e50D27126b57D51efb61E0837e38A31d306` | [view](https://basescan.org/address/0x8A338e50D27126b57D51efb61E0837e38A31d306) |

- **Chain:** Base (EVM, chainId `8453`)
- **Fee recipient:** `0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA` (0.5% of every launch)
- **Fee rate:** `50 bps` = `0.5%` (one-time, mint-time — not a per-trade tax)
- **Deployer (example):** `0xcA6067dc2b566fa688466B05c300A95720c69b00`

**On-chain proof (read from mainnet):** deploying `AST` with supply 1,000,000 minted
`5,000` to the fee recipient and `995,000` to the deployer — supply conserved exactly.
Verify on [Basescan](https://basescan.org/address/0x8A338e50D27126b57D51efb61E0837e38A31d306).

---

## How the fee works

```
fee = totalSupply * feeBps / 10000     // feeBps = 50  →  0.5%
deployer.balance = totalSupply - fee    // 99.5%
feeRecipient.balance = fee              // 0.5%, minted at deploy
```

- **Transparent:** the recipient + rate are public constants on `FeeRegistry`.
- **Fail-closed:** a supply whose 0.5% underflows to 0 is **rejected** (no silent zero-fee launches).
- **Immutable:** `recipient`, `feeBps`, and `deployer` are set once in the constructor.

---

## Deploying a token (humans)

**Via the API** (no wallet needed to compute the fee — it returns the deploy parameters):

```bash
curl -X POST https://endpoint-jubilee-labs.vercel.app/launch \
  -H 'content-type: application/json' \
  -d '{ "name": "My Token", "symbol": "MYK", "supply": 1000000 }'
# → fee.wei 5000 (to 0x2091…5DeA), deployer.wei 995000
```

**Via Foundry** (actually broadcast the contract to Base mainnet):

```bash
export RPC=https://mainnet.base.org
export KEY=<your-funded deployer private key>   # Base ETH for gas

# 1. deploy the FeeRegistry (once per protocol)
forge create contracts/FeeRegistry.sol:FeeRegistry \
  --rpc-url $RPC --private-key *** --broadcast \
  --constructor-args 0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA 50 <deployer>

# 2. deploy a Token pointing at that registry (per launch)
forge create contracts/Token.sol:Token \
  --rpc-url $RPC --private-key *** --broadcast \
  --constructor-args "My Token" MYK 1000000 <FeeRegistry-address>
```

Every `Token` deployed against the registry automatically mints **0.5% to the fee
recipient** at deploy — no extra steps, no way to skip it.

## Deploying a token (agents)

An agent deploys through **Agent Stack** in the same safe order:

1. **Identity** — sign in with its wallet (agent-inbox) → the agent has a stable address.
2. **Permission** — a contract says the agent *may* launch (agent-authority, allow/ask/deny).
3. **Safety** — optional gate: refuse to deploy if token-risk scores the project `< C`.
4. **Launch** — call the `/launch` endpoint (or broadcast via Foundry) → 0.5% minted to protocol.

That's the full rail: an agent can only launch what it's *authorized* to launch, and
every launch pays the protocol fee transparently.

---

## Repository layout

```
contracts/FeeRegistry.sol   # immutable fee rail: recipient, feeBps, feeFor
contracts/Token.sol         # deployable token: mints 0.5% to feeRecipient
test/TokenFee.t.sol         # Foundry tests (7/7) — proves the 0.5% mint
endpoint/server.js          # zero-dep HTTP endpoint: /launch, /fee/recipient, /fee/rate
endpoint/package.json       # endpoint deps + scripts
```

## Tests

```bash
forge test                 # 7/7 contract tests on a real EVM
node endpoint/test.js      # 9/9 HTTP endpoint tests
```

## License
MIT — open source, free, no platform lock-in.