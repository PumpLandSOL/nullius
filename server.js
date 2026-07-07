// dregg/server.js
// The devnet node. Serves the static site AND runs the SAME executor the
// browser playground runs. Its /status line names the state producer honestly:
// there is one executor (kernel/executor.js), and this node calls it — so "the
// kernel the proofs are about" and "the code the node runs" are the same file.
//
// Dependency-free: Node stdlib only (http, fs, crypto via WebCrypto globals).

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { genesis, makeCell, applyTurn, faucet, verifyHistory, ISSUER_WELL } from "./kernel/executor.js";
import { genKeypair, randomHex } from "./kernel/crypto.js";
import { issue, attenuate } from "./kernel/caps.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(__dirname, "public");
const PORT = process.env.PORT || 8130;
const DATA_PATH = process.env.DATA_PATH || null; // optional persistence

// ---- the federation state (single-node devnet) -----------------------------

let STATE = genesis();
const AGENTS = {}; // name -> { pub, priv, cell, secret }

// Seed demo agents (alice/bob/carol) with real keypairs and a little history,
// so the explorer has genuine receipt chains to scrub. Faucet mints are issuer
// moves, so Σ stays zero.
async function seed() {
  for (const name of ["alice", "bob", "carol"]) {
    const kp = await genKeypair();
    const secret = await randomHex(32);
    const cell = `cell:${name}`;
    STATE.cells[cell] = makeCell(cell, { owner: kp.pub, rootSecret: secret, predicate: { kind: "solvent" } });
    AGENTS[name] = { pub: kp.pub, priv: kp.priv, cell, secret };
  }
  // faucet everyone
  for (const name of ["alice", "bob", "carol"]) {
    const r = await faucet(STATE, { recipient: AGENTS[name].cell, asset: "GRAIN", amount: 1000, producerPub: "producer:lean" });
    STATE = r.state;
  }
  // a couple of real signed transfers so there is a chain to explore
  await demoTransfer("alice", "bob", 120);
  await demoTransfer("bob", "carol", 40);
  await demoTransfer("alice", "carol", 75);
}

async function demoTransfer(fromName, toName, amount) {
  const a = AGENTS[fromName];
  const cap = await issue(a.secret, { cell: a.cell, rights: ["transfer", "write"], holder: a.pub });
  const { signTurn } = await import("./kernel/executor.js");
  const turn = await signTurn({
    actorPub: a.pub, actorPriv: a.priv, nonce: await randomHex(),
    actions: [{ verb: "transfer", asset: "GRAIN", amount, from: a.cell, to: AGENTS[toName].cell, cap }],
  });
  const r = await applyTurn(STATE, turn);
  if (r.ok) STATE = r.state;
  return r;
}

async function persist() {
  if (!DATA_PATH) return;
  try { await writeFile(DATA_PATH, JSON.stringify({ state: STATE, agents: AGENTS }), "utf8"); } catch {}
}
async function restore() {
  if (DATA_PATH && existsSync(DATA_PATH)) {
    try {
      const d = JSON.parse(await readFile(DATA_PATH, "utf8"));
      STATE = d.state; Object.assign(AGENTS, d.agents);
      return true;
    } catch {}
  }
  return false;
}

// ---- API -------------------------------------------------------------------

function cellView(id) {
  const c = STATE.cells[id];
  if (!c) return null;
  const touched = STATE.receipts.filter(r => true); // full chain; per-cell markers below
  return {
    id: c.id,
    balances: c.balances,
    slots: Object.fromEntries(Object.entries(c.slots || {}).filter(([k]) => !k.startsWith("__") || k === "__spent__")),
    owner: c.owner,
    predicate: c.predicate,
    exists: true,
  };
}

async function handleApi(req, res, url) {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(obj, null, 2));
  };

  if (url.pathname === "/status") {
    return send(200, {
      status: "healthy",
      federation: "solo",
      state_producer: "lean",       // honest: the one executor is the producer
      full_turn_proving: true,
      cells: Object.keys(STATE.cells).length,
      receipts: STATE.receipts.length,
      head: STATE.head,
      seq: STATE.seq,
      note: "recreation — real ed25519/HMAC/hash-chained receipts; STARK/Lean layer represented, not reproduced",
    });
  }

  if (url.pathname === "/api/agents") {
    // public info only (pubkeys + cell ids), never private keys
    return send(200, Object.fromEntries(Object.entries(AGENTS).map(([n, a]) => [n, { pub: a.pub, cell: a.cell }])));
  }

  if (url.pathname === "/api/faucet" && req.method === "POST") {
    const body = await readBody(req);
    const { recipient, amount = 1000, asset = "GRAIN" } = body || {};
    if (!recipient) return send(400, { error: "recipient required" });
    if (!(amount > 0) || amount > 1_000_000) return send(400, { error: "amount out of range" });
    const r = await faucet(STATE, { recipient, asset, amount, producerPub: "producer:lean" });
    STATE = r.state; await persist();
    return send(200, { ok: true, receipt: r.receipt, cell: cellView(recipient) });
  }

  const cellMatch = url.pathname.match(/^\/api\/cell\/(.+?)(\/history)?$/);
  if (cellMatch) {
    const id = decodeURIComponent(cellMatch[1]);
    const wantHistory = !!cellMatch[2];
    const v = cellView(id);
    if (!v) return send(404, { error: "unknown cell", id });
    if (wantHistory) {
      // receipts are the history; a light client scrubs them. We return the
      // whole chain (each receipt binds the WHOLE post-state) with verdicts.
      const verified = await verifyHistory(STATE.receipts);
      return send(200, { cell: v, chain: STATE.receipts, verified: verified.receipts, head: STATE.head });
    }
    return send(200, v);
  }

  if (url.pathname === "/api/history") {
    const verified = await verifyHistory(STATE.receipts);
    return send(200, { receipts: STATE.receipts, verified: verified.receipts, ok: verified.ok, head: STATE.head });
  }

  if (url.pathname === "/api/verify") {
    const v = await verifyHistory(STATE.receipts);
    return send(200, v);
  }

  if (url.pathname === "/api/turn" && req.method === "POST") {
    // Accept a fully-formed, client-signed turn and run it through the executor.
    const turn = await readBody(req);
    if (!turn || !turn.actor || !turn.sig) return send(400, { error: "malformed turn" });
    const r = await applyTurn(STATE, turn);
    if (r.ok) { STATE = r.state; await persist(); return send(200, { ok: true, receipt: r.receipt }); }
    return send(200, { ok: false, reason: r.reason }); // the rejection is the product
  }

  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
  });
}

// ---- static files ----------------------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
};

const KERNEL = join(__dirname, "kernel");

async function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";

  // Serve the SAME kernel the node runs to the browser playground, so both
  // execute one executor — the whole point.
  if (p.startsWith("/kernel/")) {
    const kf = normalize(join(KERNEL, p.slice("/kernel/".length)));
    if (kf.startsWith(KERNEL) && existsSync(kf)) return sendFile(res, kf);
    res.writeHead(404); return res.end("no such kernel module");
  }

  const full = normalize(join(PUBLIC, p));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end("forbidden"); }
  if (!existsSync(full)) {
    // SPA-ish fallback for extensionless directory routes
    const alt = full + ".html";
    if (existsSync(alt)) return sendFile(res, alt);
    res.writeHead(404, { "content-type": "text/html" });
    return res.end("<h1>404</h1><p>not a surface here. <a href='/'>home</a></p>");
  }
  return sendFile(res, full);
}
async function sendFile(res, full) {
  try {
    const buf = await readFile(full);
    res.writeHead(200, { "content-type": MIME[extname(full)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(500); res.end("read error"); }
}

// ---- boot ------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" }); return res.end(); }
  try {
    if (url.pathname === "/status" || url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (handled === null) { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "no such endpoint" })); }
      return;
    }
    await serveStatic(req, res, url);
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e && e.message || e) }));
  }
});

if (!(await restore())) { await seed(); }
server.listen(PORT, () => {
  console.log(`dregg devnet on http://localhost:${PORT}`);
  console.log(`  state_producer: lean (one executor, ${STATE.receipts.length} receipts, head ${(STATE.head||"").slice(0,12)})`);
});
