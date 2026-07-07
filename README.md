# ∅ NULLIUS

**take nobody's word for it.**

A desktop where a window *is* a capability — a verified object-capability substrate.
A light client cannot be fooled.

[**nulliussol.xyz**](https://nulliussol.xyz) · [@NullOnSOL](https://x.com/NullOnSOL) · `$NULL` on Solana · AGPL-3.0-or-later

---

`nullius in verba` — take nobody's word for it. So don't take ours: the whole thing is
here, it runs, and you can break it yourself.

NULLIUS is an object-capability kernel whose entire semantics reduce to three objects —
**cells, turns, receipts**. Every state change is an atomic, capability-gated, ed25519-signed
*turn* that leaves a hash-chained *receipt*. A light client verifies an entire history by
re-checking the receipt chain — re-executing nothing, trusting no server.

## What is real here

- **Cells · turns · receipts** — the whole kernel (`kernel/executor.js`), pure and deterministic.
- **ed25519** signatures on every turn (WebCrypto — the *same* code in Node and the browser).
- **HMAC** capability tag chains: attenuable, never amplifiable (the macaroon → biscuit lineage).
- **SHA-256** hash-chained receipts binding the whole post-state.
- **A light client** (`verifyHistory`) that re-checks a whole history, re-executing nothing —
  and catches *the pale ghost* (a server presenting a state it never legitimately produced).
- **One executor, two homes** — the in-browser playground imports the *same* files the node runs.

The five guarantees, enforced in running code: **Authority · Conservation · Integrity ·
Freshness · Unfoolability**. `node kernel/selftest.mjs` proves them out (13 checks).

## What is represented, not reproduced

NULLIUS is a working recreation of the ideas in [emberian's **dregg**](https://emberian.github.io/dregg/)
(deos / dregg / robigalia-on-seL4, AGPL-3.0-or-later). It reproduces the part that can be
reproduced honestly — the capability kernel and its light client — and **clearly marks** the
rest as represented:

- Machine-checked **Lean** proofs and three-axiom kernel pinning.
- Real on-device **STARK / FRI** proving and recursive folding.
- Boot on the **seL4** microkernel with Rust protection domains.

The structure is faithful; the trust base is stated, never hidden. See
[`/verify.html`](https://nulliussol.xyz/verify.html) for the exact seam. Nothing here claims
a proof it does not have.

## Run it

```sh
npm start                    # devnet node + site on http://localhost:8130  (honours $PORT)
node kernel/selftest.mjs     # 13 checks: authority, conservation, freshness, integrity, unfoolability
```

Then:

- `/` — the manifesto and the assurance case
- `/playground/` — stage turns; overdraw, replay, forge, or tamper — the kernel refuses, in your browser
- `/explorer/` — scrub the live receipt chain; every verification badge is computed client-side
- `/verify.html` — what is enforced vs. represented, and how to check it yourself

Dependency-free: Node stdlib only (`http`, WebCrypto globals). Requires Node ≥ 20.

## Layout

```
kernel/
  crypto.js      ed25519 · HMAC · SHA-256 commitments  (runs in Node AND the browser)
  caps.js        attenuable, never-amplifiable capability tokens
  executor.js    cells · turns · receipts — the one executor
  selftest.mjs   end-to-end proof of the five guarantees
server.js        the devnet node: serves the site + the same executor over HTTP
public/          the site (Zero-Knowledge Noir), playground, explorer
_studio/         brand-kit + animation renderers (headless Chrome → PNG / mp4)
```

## API

- `GET  /status` — health; names the state producer honestly
- `POST /api/faucet` — `{recipient, amount}` — an issuer move (Σ stays 0)
- `GET  /api/cell/{id}` · `GET /api/cell/{id}/history` · `GET /api/history` · `GET /api/verify`
- `POST /api/turn` — submit a client-signed turn

## Credit

The design, terminology, and assurance framing follow [emberian's dregg](https://github.com/emberian/dregg)
and the object-capability lineage it builds on (Miller's *Robust Composition*; Birgisson et al.,
*Macaroons*; biscuit-auth; Klein et al., *seL4*; Ben-Sasson et al., *STARKs*). The running kernel
in this repository is original code.

## License

AGPL-3.0-or-later. See [`LICENSE`](LICENSE).
