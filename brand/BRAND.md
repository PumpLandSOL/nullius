# NULLIUS — brand kit

**Take nobody's word for it.** A verified capability substrate on Solana. $NULL.

Aesthetic: **Zero-Knowledge Noir** — classified-document meets cryptographic terminal.

---

## The mark

**∅** — the empty set. Chosen twice over: *nullius in verba* ("take nobody's word for it"),
and the **nullifier**, the freshness primitive that kills a spent nonce. Rendered as a ring +
slash inside a rounded-square "chip" with a signal-green glow and corner ticks.

- `nullius-mark.svg` — icon only (vector, font-independent)
- `nullius-wordmark.svg` — horizontal lockup (mark + NULLIUS)
- `nullius-pfp.png` (1024²) — social avatar

Clear space = at least the height of the ∅ ring on all sides. Never recolor the mark off-brand,
never stretch it, never place it on a busy photo — it lives on ink or the hex field.

## Color

| Token      | Hex        | Use |
|------------|------------|-----|
| Ink        | `#0a0a0b`  | base background |
| Void       | `#050506`  | insets, terminals, cards |
| Phosphor   | `#e9f2f7`  | primary text (cold white-blue) |
| Dim        | `#9aa4ae`  | body text |
| Muted      | `#5b636d`  | captions, comments |
| **Signal** | `#00ff9c`  | THE accent — authorized / verified / granted. Use sparingly. |
| Signal-2   | `#4dffbf`  | hover / lift |
| Deny       | `#ff3b52`  | denied / tampered / rejected |
| Amber      | `#ffb84d`  | warnings / the honest seam |

Rule of thumb: the page is 95% ink and phosphor. Signal green is a scalpel, not a paint roller —
it marks the thing that is *proven true*. Red marks the thing that is *refused*.

## Type

- **Mono** (headings, labels, data, code): Berkeley Mono → JetBrains Mono → Cascadia Code → Consolas → ui-monospace. Uppercase, tight tracking for display; wide tracking (`.1–.28em`) for micro-labels.
- **Sans** (body prose): Inter → Segoe UI → system-ui. Comfortable line-height for readability.

Headlines are UPPERCASE MONO. Micro-labels read like `// SECTION` or `§ THE ASSURANCE CASE`.

## Motifs (the texture of the brand)

- **Hex-rain** — faint drifting hexadecimal columns behind everything (the witness graph, breathing).
- **Scanlines** — subtle CRT overlay. Classified footage, not a gimmick — keep opacity low.
- **Redaction bars** — `████` you can't read *unless you hold the capability*. Hover reveals authorized text; locked bars show `[REDACTED · NO CAP]`. This is the core visual argument: privacy is physics.
- **Terminal readouts** — `✓ COMMITTED` / `✗ REFUSED` / `✓ UNFOOLABLE`. The rejection is the product.
- **Corner ticks** on cards; a rotated **UNFOOLABLE** wet-ink stamp.

## Voice

Terse, exact, a little cold. Systems-paper cadence. State what is *enforced* vs *represented* —
never claim a proof you don't have. Signature lines:

- *Take nobody's word for it.*
- *A window is a capability.*
- *A light client cannot be fooled.*
- *The rejection is the product.*
- *Authority is something you show, never something you claim.*

## Assets in this kit

| File | Size | Use |
|------|------|-----|
| `nullius-pfp.png` | 1024×1024 | avatar (X / Telegram / pump.fun) |
| `nullius-banner.png` | 1500×500 | X header |
| `nullius-keyart.png` | 1600×900 | hero / launch card |
| `nullius-guarantees.png` | 1600×900 | the A–E assurance ledger |
| `nullius-howitworks.png` | 1600×900 | cells · turns · receipts |
| `nullius-og.png` | 1200×630 | open-graph / link preview |
| `nullius-mark.svg`, `nullius-wordmark.svg` | vector | logo sources |

Rebuild any asset with `node _studio/build.js` (renders the HTML scenes via headless Chrome).
