// Local e2e test for the agent-launch HTTP endpoint.
// Boots server.js; exercises /health, /fee/recipient, /fee/rate, /launch (allow + underflow), CORS.
import { spawn } from "node:child_process";

const PORT = 3498;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log("PASS " + n); } else { fail++; console.log("FAIL " + n + " :: " + d); } };

const srv = spawn("node", ["server.js"], { env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => setTimeout(r, 1200));

async function get(p) { const r = await fetch(BASE + p); return { status: r.status, json: await r.json() }; }
async function post(p, body) {
  const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}

try {
  const h = await get("/health");
  check("health ok", h.status === 200 && h.json.ok === true && h.json.service === "agent-launch");

  const rec = await get("/fee/recipient");
  check("recipient = protocol address + disclosed", rec.status === 200 && rec.json.recipient === "0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA" && rec.json.disclosed === true);

  const rate = await get("/fee/rate");
  check("rate = 50 bps (0.5%), disclosed", rate.status === 200 && rate.json.feeBps === 50 && rate.json.percent === 0.5);

  // 1,000,000 supply -> fee 5,000 (0.5%), deployer 995,000
  const l = await post("/launch", { name: "Agent Token", symbol: "AGT", supply: 1000000 });
  check("launch: 0.5% fee computed", l.status === 200 && l.json.fee.wei === "5000" && l.json.deployer.wei === "995000", JSON.stringify(l.json));

  // supply that underflows fee to 0 must be rejected (fail-closed), not silently ok
  const tiny = await post("/launch", { name: "Micro", symbol: "MIC", supply: 1 });
  check("launch: underflow supply rejected (fail-closed)", tiny.status === 400, JSON.stringify(tiny.json));

  const bad = await post("/launch", { name: "X", symbol: "Y" });
  check("launch: missing supply -> 400", bad.status === 400);

  const inv = await post("/launch", { name: 1, symbol: 2, supply: -5 });
  check("launch: invalid -> 400", inv.status === 400);

  const cors = await fetch(BASE + "/health", { headers: { Origin: "https://agentos-landing.vercel.app" } });
  check("CORS header present", (cors.headers.get("access-control-allow-origin") || "") === "*");

  const pre = await fetch(BASE + "/launch", { method: "OPTIONS", headers: { Origin: "https://agentos-landing.vercel.app", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
  check("CORS preflight OPTIONS 204 + allow", pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*");
} catch (e) {
  fail++;
  console.log("EXC: " + e.message);
} finally {
  srv.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);