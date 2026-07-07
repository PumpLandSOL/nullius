// dregg/kernel/caps.js
// Capabilities: unforgeable, attenuable, never amplifiable.
//
// A capability names an authority over ONE cell. At issuance it binds a set of
// ROOT RIGHTS into an HMAC tag rooted in a secret only the owning cell holds.
// After that, anyone holding the token may ATTENUATE it — append caveats that
// only ever RESTRICT — recomputing the tag from the one they hold. They can
// never AMPLIFY it: to widen the root rights, or drop a caveat, you would need
// the cell's root secret, which you do not have.
//
// This is the macaroon construction (biscuit generalised it; the real dregg
// lifts it into its proof system). Rights-narrowing is itself expressed as a
// caveat, so the verifier's job is uniform: replay the tag chain, then compute
// effective rights = rootRights ∩ (every rights-caveat) and enforce the rest.

import { hmac, utf8, toHex, fromHex, canonicalBytes } from "./crypto.js";

// Root secrets travel as hex strings (so they survive JSON state snapshots) and
// become bytes only here, at the HMAC boundary.
function keyBytes(secret) {
  return typeof secret === "string" ? fromHex(secret) : secret;
}

async function idFor(rootSecret, cell, holder) {
  return toHex(await hmac(rootSecret, utf8("id\x1f" + cell + "\x1f" + holder)));
}

// Issue a root capability. Only the cell (the kernel acting for it) can, since
// only it holds `rootSecret`.
export async function issue(rootSecretHex, { cell, rights, holder }) {
  const rootSecret = keyBytes(rootSecretHex);
  const id = await idFor(rootSecret, cell, holder);
  const rootRights = [...rights].sort();
  const tag = await hmac(rootSecret, canonicalBytes({ id, cell, holder, rootRights }));
  return { id, cell, holder, rootRights, caveats: [], tag: toHex(tag) };
}

// Attenuate: append restricting caveats and fold each into the tag. Needs only
// the token in hand — no secret — and yields a token the cell will accept.
export async function attenuate(cap, { rights, caveat } = {}) {
  const caveats = cap.caveats.slice();
  const added = [];
  if (rights) added.push({ type: "rights", allow: [...rights].sort() });
  if (caveat) added.push(caveat);
  let tag = fromHex(cap.tag);
  for (const c of added) {
    caveats.push(c);
    tag = await hmac(tag, canonicalBytes(c)); // tag' = HMAC(tag, caveat)
  }
  return { ...cap, caveats, tag: toHex(tag) };
}

// Verify a presented capability against the cell's root secret by REPLAYING the
// tag chain, then compute effective rights and enforce caveats. Any amplified
// right, forged caveat, or swapped holder/cell makes the recomputed tag differ.
export async function verifyCap(rootSecretHex, cap, { now, context } = {}) {
  const rootSecret = keyBytes(rootSecretHex);

  const expectId = await idFor(rootSecret, cap.cell, cap.holder);
  if (cap.id !== expectId) return { ok: false, reason: "unknown-capability-id" };

  let tag = await hmac(rootSecret, canonicalBytes({
    id: cap.id, cell: cap.cell, holder: cap.holder, rootRights: cap.rootRights,
  }));
  for (const c of cap.caveats) tag = await hmac(tag, canonicalBytes(c));
  if (toHex(tag) !== cap.tag) return { ok: false, reason: "bad-tag (forged or amplified)" };

  // effective rights = rootRights ∩ every rights-caveat
  let effective = new Set(cap.rootRights);
  for (const c of cap.caveats) {
    if (c.type === "rights") {
      const allow = new Set(c.allow);
      effective = new Set([...effective].filter(r => allow.has(r)));
    }
  }

  // enforce the non-rights caveats
  for (const c of cap.caveats) {
    if (c.type === "expires" && now != null && now > c.at)
      return { ok: false, reason: "capability-expired" };
    if (c.type === "max_amount" && context && context.amount != null && context.amount > c.limit)
      return { ok: false, reason: "over-caveat-limit" };
  }
  return { ok: true, rights: [...effective] };
}
