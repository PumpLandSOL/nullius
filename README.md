# dregg — a verified agentic desktop (recreation)

A working recreation of [emberian.github.io/dregg](https://emberian.github.io/dregg/):
**deos** (the agentic desktop), **dregg** (the capability kernel), **robigalia** (the stack).
A window *is* a capability.

This recreation reproduces the part that can be reproduced honestly — **the capability
kernel and its light client** — as real, running, breakable code, and clearly marks the
formal-verification (Lean), zero-knowledge (STARK), and microkernel (seL4) layers as
*represented, not reproduced*. See `/verify.html` for the exact seam.

## What is real here

- **Cells, turns, receipts** — the whole kernel (`kernel/executor.js`), pure and deterministic.
- **ed25519** signatures on every turn (WebCrypto — same code in Node and the browser).
- **HMAC** capability tag chains: attenuable, never amplifiable (macaroon → biscuit lineage).
- **SHA-256** hash-chained receipts binding the whole post-state (standing in for Poseidon2).
- **A light client** (`verifyHistory`) that re-checks a whole history, re-executing nothing —
  and catches "the pale ghost" (a tampered chain).
- **One executor, two homes** — the browser playground imports the *same* files the node runs.

## What is represented, not reproduced

- Machine-checked **Lean** proofs and the three-axiom kernel pinning.
- Real on-device **STARK / FRI** proving and recursive folding.
- Boot on the **seL4** microkernel with Rust protection domains.

These are person-years of formal-methods work; the recreation mirrors their *structure and
guarantees in running code* and never claims a proof it does not have.

## Run it

```sh
node kernel/selftest.mjs     # 13 checks: authority, conservation, freshness, integrity, unfoolability
node server.js               # the devnet node + site on http://localhost:8130
```

Then:
- `/` — the manifesto and the assurance case
- `/playground/` — stage turns; try to overdraft, replay, forge, tamper — the kernel refuses, in your browser
- `/explorer/` — scrub the live node's receipt chain; every verification badge is computed client-side
- `/verify.html` — what is enforced vs. represented, and how to check it yourself
- `/deos.html`, `/firmament.html`, `/build.html`, `/docs.html`, `/glossary.html`, `/paper.html`

## API (matches the original devnet surface)

- `GET  /status` — health; names the state producer honestly
- `POST /api/faucet` — `{recipient, amount}` — an issuer move (Σ stays 0)
- `GET  /api/cell/{id}` — read a cell
- `GET  /api/cell/{id}/history`, `GET /api/history`, `GET /api/verify`
- `POST /api/turn` — submit a client-signed turn

## License

AGPL-3.0-or-later, following the source project.
