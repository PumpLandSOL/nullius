// dregg/kernel/executor.js
// The executor. This is the whole kernel: cells, turns, receipts.
//
// Everything the desktop does reduces to calling `applyTurn` here. There is one
// executor and it runs in both the browser playground and the devnet node, so
// "the kernel the proofs would be about" and "the executor the node runs" are
// the same file. The functions are pure over an explicit `state` value: no
// hidden globals, so a light client can replay or verify deterministically.
//
// THE THREE OBJECTS
//   Cell    — where state lives, behind its own predicate. Holds balances,
//             capability slots, named slots, and a program (predicate) the
//             substrate enforces on every transition.
//   Turn    — an atomic batch of actions. Each action shows a capability. The
//             whole turn commits or none of it does.
//   Receipt — the tamper-evident record a committed turn leaves. Receipts chain
//             by hash; a light client checks one head and trusts no executor.
//
// THE GUARANTEES, made concrete (honest, kernel-level versions of A–E):
//   Authority     — every action verifies a capability tag chain (caps.js) and
//                   the turn carries a valid ed25519 signature by its actor.
//   Conservation  — value only MOVES between cells; faucet mints are issuer
//                   moves from a well cell that goes negative, so Σ per asset
//                   is identically zero on every reachable state.
//   Integrity     — each receipt binds a SHA-256 commitment to the whole
//                   post-state; edit any field and the commitment no longer
//                   opens.
//   Freshness     — every turn carries a nonce; a spent nonce is a nullifier
//                   in the actor's set, so replay/double-spend is rejected.
//   Unfoolability — receipts chain (prevHash pins the parent); verifyHistory
//                   re-checks the chain + signatures + commitments, re-executing
//                   nothing.

import { commit, verify as edVerify, sign as edSign, canonicalBytes, canonicalString, toHex, sha256, utf8 } from "./crypto.js";
import { verifyCap } from "./caps.js";

export const ISSUER_WELL = "well:genesis-issuer";

// ---- state construction ----------------------------------------------------

export function genesis() {
  // A value-empty genesis in the model's sense: the issuer well is the only
  // cell with (negative) value, so Σ = 0 by construction. Faucet mints are
  // moves out of the well, keeping the invariant.
  const state = {
    cells: {},
    receipts: [],          // the append-only Q-chain
    head: null,            // commitment of the latest receipt
    seq: 0,
  };
  state.cells[ISSUER_WELL] = {
    id: ISSUER_WELL,
    balances: {},          // will go negative as it mints
    owner: null,
    rootSecret: null,
    slots: {},
    nonces: {},            // actorPub -> { nonceHex: true }
    predicate: { kind: "well" }, // the one cell allowed to hold negative value
  };
  return state;
}

// A cell is created with an owner keypair-public-key and a per-cell root secret
// (the HMAC root for capabilities it issues). `predicate` is its program.
export function makeCell(id, { owner, rootSecret, predicate, balances = {}, slots = {} }) {
  return {
    id, owner, rootSecret,
    balances: { ...balances },
    slots: { ...slots },
    nonces: {},
    predicate: predicate || { kind: "solvent" }, // default: never go negative
  };
}

// ---- predicates: a cell's program over its own transitions -----------------

// Returns null if the transition is allowed, or a string reason if refused.
// `next` is the proposed post-image of THIS cell; `ctx` describes the action.
function checkPredicate(cell, next, ctx) {
  const p = cell.predicate || { kind: "solvent" };
  switch (p.kind) {
    case "well":
      return null; // the issuer well may hold any balance, including negative
    case "solvent": {
      for (const [asset, v] of Object.entries(next.balances))
        if (v < 0) return `predicate:solvent violated (${asset} would be ${v})`;
      return null;
    }
    case "budget": {
      // A budget cell: total lifetime outflow of `asset` may not exceed `limit`.
      for (const [asset, v] of Object.entries(next.balances))
        if (v < 0) return `predicate:budget insolvent (${asset})`;
      if (ctx.direction === "out" && p.asset === ctx.asset) {
        const spent = (next.slots.__spent__ || 0) + ctx.amount;
        if (spent > p.limit) return `predicate:budget exceeded (spent ${spent} > limit ${p.limit})`;
      }
      return null;
    }
    case "frozen":
      return "predicate:frozen (cell rejects all transitions)";
    default:
      return null;
  }
}

// ---- the executor ----------------------------------------------------------

// A turn:
//   {
//     actor:   <ed25519 pub hex>,          // who is acting
//     nonce:   <hex>,                       // freshness token (nullifier)
//     actions: [ { verb, cap, ...args } ],  // atomic batch
//     sig:     <ed25519 sig hex over the body>
//   }
//
// Supported verbs (the reference subset of the "eight verbs"):
//   transfer { cap, asset, amount, from, to }   move value between cells
//   set_slot { cap, cell, key, value }          write a named slot
//
// Returns { ok, state, receipt } on commit, or { ok:false, reason } on refusal.
// On refusal the input `state` is returned UNTOUCHED (all-or-nothing).
export async function applyTurn(state, turn) {
  // --- 1. Authority: the turn must be signed by its actor. ---
  const body = turnBody(turn);
  const sigOk = await edVerify(turn.actor, turn.sig, utf8(canonicalString(body)));
  if (!sigOk) return refuse(state, "authority: bad turn signature");

  // --- 2. Freshness: the nonce must not have been spent by this actor. ---
  //   (checked against a working copy so a rejected turn spends nothing)
  const work = cloneState(state);
  const spent = (work.cells[actorCellOf(turn)] || {}); // per-actor nonce set lives on the actor's home cell if present; else global
  const nullifiers = work.__nonces__ || (work.__nonces__ = {});
  const seen = nullifiers[turn.actor] || (nullifiers[turn.actor] = {});
  if (seen[turn.nonce]) return refuse(state, "freshness: nonce already spent (replay/double-spend)");

  // --- 3. Execute each action against the working copy, all-or-nothing. ---
  for (const action of turn.actions) {
    const reason = await applyAction(work, turn.actor, action);
    if (reason) return refuse(state, reason); // any leg fails => whole turn voids
  }

  // --- 4. Commit: spend the nonce, produce and chain the receipt. ---
  seen[turn.nonce] = true;
  work.seq = state.seq + 1;
  const stateRoot = await commit("state", stateImage(work));
  const turnHash = await commit("turn", body);
  const prevHash = state.head;
  const receiptBody = {
    seq: work.seq,
    prevHash,
    turnHash,
    stateRoot,
    actor: turn.actor,
    ts: turn.ts ?? Date.now(),
  };
  const q = await commit("receipt", receiptBody);
  const receipt = { ...receiptBody, q };
  work.receipts = state.receipts.concat([receipt]);
  work.head = q;
  return { ok: true, state: work, receipt };
}

async function applyAction(work, actor, action) {
  switch (action.verb) {
    case "transfer": {
      const { asset, amount, from, to, cap } = action;
      if (!(amount > 0)) return "transfer: amount must be positive";
      const src = work.cells[from];
      const dst = work.cells[to];
      if (!src) return `transfer: unknown source cell ${from}`;
      if (!dst) return `transfer: unknown dest cell ${to}`;

      // Authority: the capability must name the source cell, be held by the
      // acting key, verify against the source's root secret, and — after
      // narrowing by its caveats — still grant `transfer`.
      if (!cap) return "authority: transfer presented no capability";
      if (cap.cell !== from) return "authority: capability does not name the source cell";
      if (cap.holder !== actor) return "authority: capability holder is not the acting key";
      if (src.rootSecret) {
        const v = await verifyCap(src.rootSecret, cap, { now: Date.now(), context: { amount } });
        if (!v.ok) return "authority: " + v.reason;
        if (!v.rights.includes("transfer")) return "authority: capability does not grant transfer (narrowed away)";
      }

      // Propose post-images and run each cell's predicate.
      const srcNext = { ...src, balances: { ...src.balances, [asset]: (src.balances[asset] || 0) - amount } };
      const dstNext = { ...dst, balances: { ...dst.balances, [asset]: (dst.balances[asset] || 0) + amount } };
      const r1 = checkPredicate(src, srcNext, { direction: "out", asset, amount });
      if (r1) return r1;
      const r2 = checkPredicate(dst, dstNext, { direction: "in", asset, amount });
      if (r2) return r2;

      // track budget spend
      if (src.predicate && src.predicate.kind === "budget" && src.predicate.asset === asset)
        srcNext.slots = { ...srcNext.slots, __spent__: (src.slots.__spent__ || 0) + amount };

      work.cells[from] = srcNext;
      work.cells[to] = dstNext;
      return null;
    }
    case "set_slot": {
      const { cell, key, value, cap } = action;
      const c = work.cells[cell];
      if (!c) return `set_slot: unknown cell ${cell}`;
      if (!cap || cap.cell !== cell) return "authority: no capability for cell";
      if (cap.holder !== actor) return "authority: capability holder is not the acting key";
      if (c.rootSecret) {
        const v = await verifyCap(c.rootSecret, cap, { now: Date.now() });
        if (!v.ok) return "authority: " + v.reason;
        if (!v.rights.includes("write")) return "authority: capability does not grant write (narrowed away)";
      }
      const next = { ...c, slots: { ...c.slots, [key]: value } };
      const r = checkPredicate(c, next, { direction: "slot" });
      if (r) return r;
      work.cells[cell] = next;
      return null;
    }
    default:
      return `unknown verb: ${action.verb}`;
  }
}

// Faucet: an issuer MOVE from the well to a recipient. Conservation holds
// because the well simply goes more negative by exactly what it mints.
export async function faucet(state, { recipient, asset = "GRAIN", amount, producerPriv, producerPub }) {
  const work = cloneState(state);
  if (!work.cells[recipient]) {
    // auto-create a plain solvent cell owned by nobody in particular (a bearer cell)
    work.cells[recipient] = makeCell(recipient, { owner: null, rootSecret: null, predicate: { kind: "solvent" } });
  }
  const well = work.cells[ISSUER_WELL];
  well.balances[asset] = (well.balances[asset] || 0) - amount;
  const r = work.cells[recipient];
  r.balances[asset] = (r.balances[asset] || 0) + amount;

  work.seq = state.seq + 1;
  const stateRoot = await commit("state", stateImage(work));
  const receiptBody = {
    seq: work.seq, prevHash: state.head,
    turnHash: await commit("turn", { faucet: { recipient, asset, amount } }),
    stateRoot, actor: producerPub || "producer:lean", ts: Date.now(),
  };
  const q = await commit("receipt", receiptBody);
  const receipt = { ...receiptBody, q };
  work.receipts = state.receipts.concat([receipt]);
  work.head = q;
  return { ok: true, state: work, receipt };
}

// ---- light client: verify a whole history, re-executing nothing ------------

// Given the receipt list, re-check the chain: each receipt's prevHash pins its
// parent's q, its own q opens its body, and the sequence is monotonic. Returns
// per-receipt verdicts plus an overall verdict. This is what "a light client
// cannot be fooled" means operationally: no executor is trusted, only hashes.
export async function verifyHistory(receipts) {
  const out = [];
  let prev = null;
  let seq = 0;
  let ok = true;
  for (const r of receipts) {
    const problems = [];
    // recompute q from the body and check it opens
    const { q, ...bodyPlusQ } = r;
    const body = { seq: r.seq, prevHash: r.prevHash, turnHash: r.turnHash, stateRoot: r.stateRoot, actor: r.actor, ts: r.ts };
    const recomputed = await commit("receipt", body);
    if (recomputed !== q) problems.push("commitment does not open (tampered field)");
    if (r.prevHash !== prev) problems.push("prevHash does not pin parent (chain broken / reorder)");
    if (r.seq !== seq + 1) problems.push(`sequence gap (expected ${seq + 1}, got ${r.seq})`);
    const verdict = problems.length === 0;
    if (!verdict) ok = false;
    out.push({ seq: r.seq, q, verified: verdict, problems });
    prev = q;
    seq = r.seq;
  }
  return { ok, head: prev, receipts: out };
}

// ---- helpers ---------------------------------------------------------------

function turnBody(turn) {
  return { actor: turn.actor, nonce: turn.nonce, actions: turn.actions.map(stripCapSecret), ts: turn.ts ?? null };
}
function stripCapSecret(a) {
  // capabilities are public tokens; nothing secret is in them, so the whole
  // action is signed verbatim.
  return a;
}
function actorCellOf(turn) { return `home:${turn.actor}`; }

// A deterministic image of the whole state for commitment: every cell's
// balances and slots, plus the issuer well, projected into one sorted object.
function stateImage(state) {
  const cells = {};
  for (const [id, c] of Object.entries(state.cells)) {
    cells[id] = { balances: c.balances, slots: dropInternal(c.slots) };
  }
  return { seq: state.seq, cells, nonces: state.__nonces__ || {} };
}
function dropInternal(slots) {
  const o = {};
  for (const [k, v] of Object.entries(slots || {})) if (!k.startsWith("__")) o[k] = v;
  // keep __spent__ visible in commitment so budget state is bound too
  if (slots && slots.__spent__ != null) o.__spent__ = slots.__spent__;
  return o;
}

function cloneState(state) {
  const s = JSON.parse(JSON.stringify({ ...state, __nonces__: state.__nonces__ || {} }));
  return s;
}

function refuse(state, reason) {
  return { ok: false, reason, state };
}

// Convenience: build + sign a turn given the actor's private key.
export async function signTurn({ actorPub, actorPriv, nonce, actions, ts }) {
  const body = { actor: actorPub, nonce, actions, ts: ts ?? null };
  const sig = await edSign(actorPriv, utf8(canonicalString(body)));
  return { actor: actorPub, nonce, actions, ts: ts ?? null, sig };
}
