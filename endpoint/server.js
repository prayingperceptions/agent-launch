// server.js — Agent Launch HTTP endpoint (zero-dependency Node).
// Thin wrapper over the Agent Launch token-deployment protocol:
//   GET  /              -> endpoints list
//   GET  /health        -> status
//   GET  /fee/recipient -> protocol fee payout address (public disclosure)
//   GET  /fee/rate      -> feeBps (50 == 0.5%) + human-readable 0.5%
//   POST /launch        -> { name, symbol, supply } -> token deploy params + fee breakdown
// CORS: Access-Control-Allow-Origin:* so the live browser demo can call it.
import http from 'node:http';

const PORT = parseInt(process.env.PORT || '8790', 10);

// Protocol constants — the immutable fee rail.
const FEE_BPS = 50;                                     // 0.5% in basis points
const PROTOCOL_TO = '0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA'; // protocol recipient

const FEE_NUM = BigInt(FEE_BPS);
const BPS_DENOM = 10000n;

function send(res, status, obj, addHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    ...addHeaders
  });
  res.end(JSON.stringify(obj, null, 2));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __invalid: true }; }
}

function feeFor(supplyWei) {
  // fee = supply * FEE_BPS / 10000  (0.5%). Returns [fee, deployer].
  const fee = (supplyWei * FEE_NUM) / BPS_DENOM;
  return [fee, supplyWei - fee];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method;
  const path = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (method === 'OPTIONS') return send(res, 204, {}, {});

    if (method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, service: 'agent-launch', version: '0.1.0', chain: 'base' });
    }

    if (method === 'GET' && path === '/') {
      return send(res, 200, { service: 'agent-launch', endpoints: ['/health', '/fee/recipient', '/fee/rate', '/launch'] });
    }

    if (method === 'GET' && path === '/fee/recipient') {
      return send(res, 200, { recipient: PROTOCOL_TO, disclosed: true });
    }

    if (method === 'GET' && path === '/fee/rate') {
      return send(res, 200, { feeBps: FEE_BPS, percent: 0.5, basisPoints: '50/10000', disclosed: true });
    }

    if (method === 'POST' && path === '/launch') {
      const body = await readBody(req);
      if (body.__invalid) return send(res, 400, { error: 'invalid JSON body' });
      const name = String(body.name || '').trim();
      const symbol = String(body.symbol || '').trim();
      const supply = body.supply;
      if (!name || !symbol) return send(res, 400, { error: 'body requires { name, symbol }' });
      if (typeof supply !== 'number' || !Number.isFinite(supply) || supply <= 0) {
        return send(res, 400, { error: 'body.supply must be a positive number (>0)' });
      }
      const supplyWei = BigInt(Math.floor(supply));
      if (supplyWei <= 0n) return send(res, 400, { error: 'supply too small; fee would underflow to 0 (fail-closed)' });
      const [fee, deployer] = feeFor(supplyWei);
      if (fee <= 0n) return send(res, 400, { error: `supply ${supplyWei} underflows 0.5% fee to 0; raise supply (min ${(BPS_DENOM / FEE_NUM) + 1n})` });
      return send(res, 200, {
        ok: true,
        token: { name, symbol, totalSupply: supplyWei.toString() },
        fee: {
          basisPoints: FEE_BPS,
          percent: 0.5,
          to: PROTOCOL_TO,
          wei: fee.toString()
        },
        deployer: { wei: deployer.toString() },
        note: 'Fee is minted on-chain at deploy (0.5% of supply to protocol recipient), transparent and disclosed.'
      });
    }

    return send(res, 404, { error: 'not found', endpoints: ['/health', '/fee/recipient', '/fee/rate', '/launch'] });
  } catch (err) {
    send(res, 500, { error: 'internal_error', detail: String(err && err.message || err) });
  }
});

server.listen(PORT, () => console.log(`agent-launch listening on :${PORT}`));