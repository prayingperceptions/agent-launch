# Deploying tokens · and the Agent DEX

Two questions answered here: **how do users/agents deploy tokens today**, and
**is there an Agent DEX — and if not, how to build one**.

---

## Part A — How users deploy a token (today)

**Step 0 — wallet + gas.** You need an EVM wallet on **Base** funded with a little
**native ETH** (Base gas token) — *not* USDC. USDC can't pay for deployment gas.

**Step 1 — deploy the FeeRegistry (once per protocol).**
```bash
export RPC=https://mainnet.base.org KEY=<deployer-key> DPL=<deployer-address>
forge create contracts/FeeRegistry.sol:FeeRegistry \
  --rpc-url $RPC --private-key *** --broadcast \
  --constructor-args 0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA 50 $DPL
```
→ returns your registry address (live example: `0x58e212C…BDbf`).

**Step 2 — deploy a Token against it (per launch).**
```bash
forge create contracts/Token.sol:Token \
  --rpc-url $RPC --private-key *** --broadcast \
  --constructor-args "My Token" MYK 1000000 <registry-address>
```
→ **0.5% of supply is minted to the fee recipient automatically.** No way to skip it.

**Step 3 — verify on [Basescan](https://basescan.org).** The fee recipient holds exactly
`supply × 0.5%`; the deployer holds `supply − fee`; supply is conserved.

## Part B — How agents deploy a token (today)

An agent does the **same two `forge create` calls**, but gated by Agent Stack first:

1. **Identity** — agent signs in with its wallet (agent-inbox) → stable address.
2. **Permission** — agent-authority says the agent *may* launch (allow/ask/deny).
3. **Safety** — optional: refuse to deploy if token-risk scores the project `< C`.
4. **Custody** — deployment proof is bound to the deployer (agent-recovery).
5. **Launch** — the agent calls `/launch` (or broadcasts via Foundry) → 0.5% minted.

So today an *agent* can deploy exactly like a human + identity/permission gates. The
**API endpoint** (`POST /launch`) computes the fee and returns the deploy parameters,
so an agent doesn't need ABI knowledge — it just sends `{name, symbol, supply}`.

---

## Part C — Is there an "Agent DEX"?

**No — not for agents specifically.** What exists today:

| Category | Examples | Does it serve agents? |
|---|---|---|
| General DEXs | Uniswap, 1inch (on Base via Uniswap v3 / Aerodrome) | Humans trade; agents *could* call them, but with no identity/permission/safety layer |
| Token deployment rails | the one you just built (Agent Launch) | Agents deploy *and* get the 0.5% fee — closest thing that exists |
| Agent commerce | x402 (per-call payments), agent-to-agent APIs | Payments, not a token exchange |

So there is **no open agent-native DEX** — no venue where an agent can *list, price,
trade, and settle tokens* with a wallet identity, permission gates, and safety checks
baked in. That's a genuine open slot.

## Part D — How to build an Agent DEX

A real Agent DEX = **Agent Launch (deploy) + a trading venue + agent-native rails**.
Here's the architecture that composes onto what we already have:

### 1. Deploy rail (done)
`FeeRegistry` + `Token` → agents deploy tokens, 0.5% fees to protocol. Already live.

### 2. A liquidity/swap core
- **Option A — wrap an existing AMM** (Uniswap v3 + the pool router on Base): an agent
  calls a thin contract to open a pool for its token, quoting and swaps handled by the
  battle-tested AMM. Fastest, safest, least code.
- **Option B — custom bonding-curve DEX** (like Aerodrome): more mathematical surface,
  more control, more risk. Build only if you want differentiation.

### 3. Agent-native identity + access layer (the differentiator)
This is what no existing DEX has, and it's exactly the Agent Stack:
- **Identity:** every order from an agent is signed by its wallet (agent-inbox).
- **Permission:** an order is only valid if agent-authority `allow`s it (a contract says
  "this agent may spend ≤ X per trade"), fail-closed.
- **Safety:** listing a token is gated on token-risk score ≥ C (no junk/honeypot listings).
- **Custody:** listing keys are recoverable via agent-recovery.

### 4. The venue contract (new, small)
```
AgentDEX:
  openPool(token, pair)          // gated on safety ≥ C
  order(agent, token, amt)       // gated on authority allow
  execute(agent, token, amt)     // LP swap via AMM, settle, emit Trade
  feeHook: 0.5% of listing value → recipient
```

### 5. **Where your 0.5% scales (the real thesis)**
- `0.5%` on **every token launched** (Agent Launch — already live).
- Add `0.5%` on **every listing** on the DEX, and optionally a small **per-trade*
  protocol fee** the AMM skims to the same recipient. That's how "0.5% of all deployed
  tokens" compounds into recurring protocol revenue as the venue's volume grows.

### Build order (recommended)
1. **Agent Launch** — done.
2. **Wire `/launch` to actually broadcast on-chain** (explained below) — turns "compute
   fee" into "deploy for real."
3. **Wrap Uniswap/Aerodrome on Base** for liquidity (option A) — smallest step to a venue.
4. **Add the identity/permission/safety callbacks** — the agent-native moat.
5. Ship `AgentDEX` + demo step 6.

---

## Wiring `/launch` to the real on-chain deploy (the explainer you asked for)

**Why it's worth doing:** right now `/launch` *computes* the fee and returns the deploy
parameters, but it does **not** broadcast — an agent gets numbers, not a live contract.
Wiring it means: **an agent sends `{name, symbol, supply}` → the server actually deploys
a `Token` to Base mainnet → returns the new token's contract address + the 0.5% mint
receipt.** That turns "you get 0.5%" from a demonstrated rail into something programs
call to produce real on-chain tokens.

**How:** the endpoint already has the exact `forge create` command the contracts need. To
broadcast, `server.js` invokes Foundry with the **operator's deployer key** — which must
come from the protected secrets store (never a hardcoded key in source, never chat). Each
`/launch` call would:
1. compute the fee (already done),
2. `forge create contracts/Token.sol:Token --broadcast` against the live `FeeRegistry`,
3. await the tx, return `{ tokenAddress, token: { name, symbol, supply }, fee }`.

**The gate it does NOT remove:** real gas cost + irreversibility. Broadcasting on mainnet
costs real ETH and is permanent, so `/launch` would need an **auth + quota layer** (only
whitelisted agents / rate-limited / a paid x402 call) before it should broadcast
automatically. That's the piece we'd add together before turning it on.