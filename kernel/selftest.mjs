// Run: node kernel/selftest.mjs
// Exercises the real executor end-to-end: authority, conservation, freshness,
// integrity, unfoolability. Every "REJECT" below is the kernel refusing an
// illegal turn — the rejection is the product.

import { genesis, makeCell, applyTurn, faucet, signTurn, verifyHistory, ISSUER_WELL } from "./executor.js";
import { genKeypair, randomHex } from "./crypto.js";
import { issue, attenuate } from "./caps.js";

const secretHex = () => randomHex(32);

let pass = 0, fail = 0;
function ok(cond, label) { (cond ? pass++ : fail++); console.log(`${cond ? "  ok  " : "FAIL  "} ${label}`); }

const alice = await genKeypair();
const bob = await genKeypair();

let s = genesis();

// Two cells: alice's wallet (she owns it) and bob's wallet.
const aliceSecret = await secretHex();
s.cells["cell:alice"] = makeCell("cell:alice", { owner: alice.pub, rootSecret: aliceSecret, predicate: { kind: "solvent" } });
s.cells["cell:bob"]   = makeCell("cell:bob",   { owner: bob.pub,   rootSecret: null,        predicate: { kind: "solvent" } });

// Faucet 1000 GRAIN into alice's cell (issuer move; well goes to -1000).
let r = await faucet(s, { recipient: "cell:alice", asset: "GRAIN", amount: 1000, producerPub: "producer:lean" });
s = r.state;
ok(s.cells["cell:alice"].balances.GRAIN === 1000, "faucet credits alice 1000 GRAIN");
ok(s.cells[ISSUER_WELL].balances.GRAIN === -1000, "issuer well holds -1000 (conservation: Sigma = 0)");

// Alice issues herself a transfer capability over her cell, then attenuates it
// with a max_amount caveat of 300.
let cap = await issue(aliceSecret, { cell: "cell:alice", rights: ["transfer", "write"], holder: alice.pub });
let capCapped = await attenuate(cap, { rights: ["transfer"], caveat: { type: "max_amount", limit: 300 } });

// GOOD turn: transfer 250 alice -> bob under the capped capability.
let turn = await signTurn({
  actorPub: alice.pub, actorPriv: alice.priv, nonce: await randomHex(),
  actions: [{ verb: "transfer", asset: "GRAIN", amount: 250, from: "cell:alice", to: "cell:bob", cap: capCapped }],
});
r = await applyTurn(s, turn);
ok(r.ok, "valid transfer of 250 commits");
if (r.ok) s = r.state;
ok(s.cells["cell:alice"].balances.GRAIN === 750, "alice now 750");
ok(s.cells["cell:bob"].balances.GRAIN === 250, "bob now 250");

// REJECT (freshness): replay the exact same turn -> nonce already spent.
r = await applyTurn(s, turn);
ok(!r.ok && /freshness/.test(r.reason), "replay rejected: " + (r.reason||""));

// REJECT (caveat): transfer 400 under a cap caveated to max 300.
let overCap = await signTurn({
  actorPub: alice.pub, actorPriv: alice.priv, nonce: await randomHex(),
  actions: [{ verb: "transfer", asset: "GRAIN", amount: 400, from: "cell:alice", to: "cell:bob", cap: capCapped }],
});
r = await applyTurn(s, overCap);
ok(!r.ok && /caveat/.test(r.reason), "over-caveat transfer rejected: " + (r.reason||""));

// REJECT (overdraft/predicate): transfer 5000 (> balance) under full cap.
let overdraft = await signTurn({
  actorPub: alice.pub, actorPriv: alice.priv, nonce: await randomHex(),
  actions: [{ verb: "transfer", asset: "GRAIN", amount: 5000, from: "cell:alice", to: "cell:bob", cap }],
});
r = await applyTurn(s, overdraft);
ok(!r.ok && /solvent/.test(r.reason), "overdraft rejected by predicate: " + (r.reason||""));

// REJECT (authority - forged amplification): bob forges a cap over alice's cell.
let forged = { ...capCapped, holder: bob.pub, rights: ["transfer"] };
let theft = await signTurn({
  actorPub: bob.pub, actorPriv: bob.priv, nonce: await randomHex(),
  actions: [{ verb: "transfer", asset: "GRAIN", amount: 100, from: "cell:alice", to: "cell:bob", cap: forged }],
});
r = await applyTurn(s, theft);
ok(!r.ok && /authority/.test(r.reason), "forged capability rejected: " + (r.reason||""));

// REJECT (authority - bad signature): tamper with a signed turn's action.
let tampered = JSON.parse(JSON.stringify(turn));
tampered.actions[0].amount = 999;
tampered.nonce = await randomHex();
r = await applyTurn(s, tampered);
ok(!r.ok && /authority/.test(r.reason), "tampered-signature turn rejected: " + (r.reason||""));

// State unchanged after all rejects.
ok(s.cells["cell:alice"].balances.GRAIN === 750 && s.cells["cell:bob"].balances.GRAIN === 250, "state untouched by every rejected turn (all-or-nothing)");

// UNFOOLABILITY: verify the whole receipt history, re-executing nothing.
let v = await verifyHistory(s.receipts);
ok(v.ok, `light client verifies ${s.receipts.length} receipts, head=${(v.head||"").slice(0,12)}...`);

// Now tamper with a committed receipt and show the light client catches it.
let tamperedHist = JSON.parse(JSON.stringify(s.receipts));
if (tamperedHist[1]) tamperedHist[1].stateRoot = "deadbeef".repeat(8);
let v2 = await verifyHistory(tamperedHist);
ok(!v2.ok, "light client catches a tampered receipt (the pale ghost fails)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
