// dregg/kernel/crypto.js
// The cryptographic floor. Real primitives, honestly labelled.
//
// This module is an ES module that runs UNCHANGED in Node (>=18) and in the
// browser, because both expose the same WebCrypto surface at
// `globalThis.crypto.subtle`. That is deliberate: the playground in your
// browser and the devnet node the server runs execute the SAME code over the
// SAME primitives. There is no second implementation to disagree with the first.
//
// The real Dregg pins its assurance case to five carriers: ed25519, HMAC,
// Poseidon2, FRI/STARK soundness, PostGST. We reproduce the two that a light
// client actually re-runs on commodity hardware:
//
//   * ed25519  — the signature on every turn handoff (WebCrypto "Ed25519").
//   * HMAC     — the caveat-chain tags that make capabilities attenuable but
//                never amplifiable (the macaroon -> biscuit lineage).
//
// The state-commitment hash is SHA-256 here, standing in for Poseidon2. We say
// so plainly: Poseidon2 is a ZK-circuit-friendly hash chosen so the commitment
// can live *inside* a STARK. SHA-256 gives the identical binding property
// (collision-resistance => a receipt binds exactly one post-state) without the
// circuit. The STARK/FRI recursion layer is represented, not reproduced.

const subtle = globalThis.crypto.subtle;

// ---- byte / hex plumbing ---------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

export function utf8(s) { return enc.encode(s); }
export function fromUtf8(b) { return dec.decode(b); }

export function toHex(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function concat(...arrs) {
  let n = 0;
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// A stable, injective-enough encoding of a JS value for hashing/signing.
// (Sorted keys => the same logical object always hashes the same way.)
export function canonicalBytes(value) {
  return utf8(canonicalString(value));
}
export function canonicalString(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalString).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalString(value[k])).join(",") + "}";
}

// ---- hashing (Poseidon2 stand-in: SHA-256) --------------------------------

export async function sha256(bytes) {
  const d = await subtle.digest("SHA-256", bytes);
  return new Uint8Array(d);
}

// Domain-tagged commitment. Every kernel field projects into one address space
// under a domain tag, exactly as the real integrity proof requires, so two
// different domains can never collide into the same pre-image.
export async function commit(domain, value) {
  const b = concat(utf8(domain + "\x1f"), canonicalBytes(value));
  return toHex(await sha256(b));
}

// ---- ed25519 (the signature on every handoff) -----------------------------

export async function genKeypair() {
  const kp = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const rawPub = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", kp.privateKey));
  return {
    pub: toHex(rawPub),                 // 32-byte public key, hex
    priv: toHex(pkcs8),                 // pkcs8-wrapped private key, hex
    _pub: kp.publicKey,
    _priv: kp.privateKey,
  };
}

async function importPriv(privHex) {
  return subtle.importKey("pkcs8", fromHex(privHex), { name: "Ed25519" }, false, ["sign"]);
}
async function importPub(pubHex) {
  return subtle.importKey("raw", fromHex(pubHex), { name: "Ed25519" }, false, ["verify"]);
}

export async function sign(privHex, bytes) {
  const key = await importPriv(privHex);
  const sig = await subtle.sign({ name: "Ed25519" }, key, bytes);
  return toHex(new Uint8Array(sig));
}

export async function verify(pubHex, sigHex, bytes) {
  try {
    const key = await importPub(pubHex);
    return await subtle.verify({ name: "Ed25519" }, key, fromHex(sigHex), bytes);
  } catch {
    return false;
  }
}

// ---- HMAC (the caveat chain: attenuate, never amplify) --------------------

async function hmacKey(keyBytes) {
  return subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

// tag' = HMAC(tag, message). Chaining caveats can only narrow: to compute the
// next tag you must hold the previous one, and you cannot run it backward.
export async function hmac(keyBytes, messageBytes) {
  const key = await hmacKey(keyBytes);
  const sig = await subtle.sign("HMAC", key, messageBytes);
  return new Uint8Array(sig);
}

export async function randomHex(nbytes = 32) {
  const u = new Uint8Array(nbytes);
  globalThis.crypto.getRandomValues(u);
  return toHex(u);
}
