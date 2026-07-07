// NULLIUS brand-kit renderer.
// Renders self-contained HTML scenes to PNG via headless Chrome.
// Run: node _studio/build.js
//
// Each scene is wrapped with the shared Zero-Knowledge Noir kit (inline CSS +
// a baked hex-rain canvas) so every file:// render is fully self-contained.

import { writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pexec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TMP = join(__dirname, "tmp");
const OUT = join(ROOT, "brand");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

/* ---- shared kit ---------------------------------------------------------- */
const KIT = `
  --void:#050506; --ink:#0a0a0b; --ink2:#0e0f12; --line:rgba(233,242,247,.10);
  --phos:#e9f2f7; --dim:#9aa4ae; --mut:#5b636d; --sig:#00ff9c; --sig2:#4dffbf; --deny:#ff3b52; --amber:#ffb84d;
  --mono:"Cascadia Code","Cascadia Mono","Consolas",ui-monospace,monospace;
  --sans:"Segoe UI",system-ui,sans-serif;
`;
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%}
body{background:var(--ink);color:var(--phos);font-family:var(--sans);overflow:hidden;position:relative}
#hex{position:absolute;inset:0;z-index:0;opacity:.42}
.glow{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(120% 90% at 50% -20%,rgba(0,255,156,.10),transparent 60%),
             radial-gradient(80% 70% at 100% 120%,rgba(89,184,255,.05),transparent 55%),
             radial-gradient(140% 130% at 50% 50%,transparent 52%,rgba(0,0,0,.6) 100%)}
.scan{position:absolute;inset:0;z-index:40;pointer-events:none;mix-blend-mode:multiply;opacity:.30;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 2px,rgba(0,0,0,.30) 2px 3px)}
.stage{position:relative;z-index:10;width:100%;height:100%;display:flex}
.stage>div{display:flex;width:100%;height:100%}
.mono{font-family:var(--mono)}
.mark{font-family:var(--mono);color:var(--sig);font-weight:700;line-height:1;
  text-shadow:0 0 40px rgba(0,255,156,.55)}
.chip{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.14em;
  border:1px solid rgba(0,255,156,.28);background:rgba(0,255,156,.08);color:var(--sig);border-radius:4px;padding:6px 14px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--sig);box-shadow:0 0 10px var(--sig)}
.ticks::before,.ticks::after{content:"";position:absolute;width:16px;height:16px;opacity:.6}
.term{background:var(--void);border:1px solid var(--line);border-radius:10px;font-family:var(--mono);overflow:hidden}
.term .bar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);color:var(--mut);letter-spacing:.1em}
.term .body{padding:20px 22px;line-height:2}
.ok{color:var(--sig)} .no{color:var(--deny)} .c{color:var(--mut)} .v{color:var(--phos)} .p{color:var(--sig)}
.rd{background:linear-gradient(180deg,#22252c,#15171c);border-radius:2px;color:transparent;padding:0 .18em;box-shadow:inset 0 0 0 1px rgba(0,0,0,.5)}
`;
const HEXJS = `
const cv=document.getElementById('hex');const x=cv.getContext('2d');
function draw(){cv.width=innerWidth;cv.height=innerHeight;const H="0123456789abcdef";const fs=15;x.font=fs+'px "Cascadia Code",Consolas,monospace';
for(let cx=0;cx<cv.width;cx+=fs*1.25){const n=6+((Math.random()*22)|0);let sy=Math.random()*cv.height;for(let j=0;j<n;j++){const yy=(sy+j*fs)%cv.height;const head=j===0;const a=head?0.5:Math.max(0,0.18-j*0.012);x.fillStyle=head?'rgba(0,255,156,'+a+')':'rgba(120,175,160,'+a+')';x.fillText(H[(Math.random()*16)|0],cx+3,yy);}}}
draw();
`;

function page(w, h, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{${KIT}}${CSS}</style></head>
<body><canvas id="hex"></canvas><div class="glow"></div><div class="scan"></div>
<div class="stage">${body}</div><script>${HEXJS}</script></body></html>`;
}

/* ---- scenes -------------------------------------------------------------- */
const scenes = [];

// 1 — PFP 1024x1024
scenes.push({ name: "nullius-pfp", w: 1024, h: 1024, body: `
<div style="flex-direction:column;align-items:center;justify-content:center;width:100%;gap:40px">
  <div style="position:relative;width:420px;height:420px;display:grid;place-items:center;
       border:2px solid rgba(0,255,156,.35);border-radius:52px;background:rgba(0,255,156,.05);
       box-shadow:0 0 90px rgba(0,255,156,.25),inset 0 0 70px rgba(0,255,156,.06)">
    <div class="mark" style="font-size:300px">∅</div>
    <div style="position:absolute;top:20px;left:20px;width:34px;height:34px;border-top:2px solid var(--sig);border-left:2px solid var(--sig);opacity:.7"></div>
    <div style="position:absolute;bottom:20px;right:20px;width:34px;height:34px;border-bottom:2px solid var(--sig);border-right:2px solid var(--sig);opacity:.7"></div>
  </div>
  <div class="mono" style="font-size:64px;font-weight:700;letter-spacing:.22em;color:var(--phos)">NULLIUS</div>
  <div class="mono" style="font-size:24px;letter-spacing:.28em;color:var(--sig);text-transform:uppercase">$NULL · verified</div>
</div>` });

// 2 — Banner 1500x500 (X header)
scenes.push({ name: "nullius-banner", w: 1500, h: 500, body: `
<div style="width:100%;align-items:center;justify-content:space-between;padding:0 80px;gap:60px">
  <div style="flex-direction:column">
    <div style="display:flex;align-items:center;gap:26px;margin-bottom:26px">
      <div style="width:96px;height:96px;display:grid;place-items:center;border:2px solid rgba(0,255,156,.35);border-radius:20px;background:rgba(0,255,156,.05);box-shadow:0 0 50px rgba(0,255,156,.22)">
        <div class="mark" style="font-size:66px">∅</div>
      </div>
      <div class="mono" style="font-size:76px;font-weight:700;letter-spacing:.16em">NULLIUS</div>
    </div>
    <div class="mono" style="font-size:30px;color:var(--sig);letter-spacing:.06em;text-shadow:0 0 24px rgba(0,255,156,.4)">take nobody's word for it.</div>
    <div style="font-family:var(--sans);font-size:21px;color:var(--dim);margin-top:16px;max-width:34ch;line-height:1.5">A desktop where a window <span style="color:var(--phos)">is</span> a capability. A light client cannot be fooled.</div>
    <div style="margin-top:26px"><span class="chip" style="font-size:15px"><span class="dot"></span>$NULL · SOLANA</span></div>
  </div>
  <div class="term" style="width:520px;flex:none">
    <div class="bar" style="font-size:13px"><span class="dot"></span> nullius@devnet · light-client</div>
    <div class="body" style="font-size:16px">
      <div><span class="p">&gt;</span> <span class="v">transfer 250 ∅ a→b</span></div>
      <div><span class="ok">✓ COMMITTED</span> <span class="c">#204</span></div>
      <div><span class="p">&gt;</span> replay #204</div>
      <div><span class="no">✗ REFUSED</span> <span class="c">nonce spent</span></div>
      <div><span class="p">&gt;</span> verify(chain)</div>
      <div><span class="ok">✓ UNFOOLABLE</span> <span class="c">trusts no one</span></div>
    </div>
  </div>
</div>` });

// 3 — Key art 1600x900
scenes.push({ name: "nullius-keyart", w: 1600, h: 900, body: `
<div style="width:100%;flex-direction:column;justify-content:center;padding:0 100px;position:relative">
  <div style="position:absolute;top:70px;right:96px;transform:rotate(-11deg);font-family:var(--mono);font-weight:700;
       letter-spacing:.08em;color:var(--sig);border:3px solid var(--sig);border-radius:6px;padding:12px 22px;font-size:30px;
       box-shadow:0 0 34px rgba(0,255,156,.3),inset 0 0 30px rgba(0,255,156,.08);text-shadow:0 0 16px rgba(0,255,156,.5);text-transform:uppercase">
    Unfoolable<div style="font-size:13px;letter-spacing:.24em;color:var(--sig2);text-align:center">light-client verified</div>
  </div>
  <div class="mono" style="font-size:26px;letter-spacing:.3em;color:var(--sig);text-transform:uppercase;margin-bottom:34px">// NULLIUS · $NULL</div>
  <div class="mono" style="font-size:118px;font-weight:700;line-height:1.02;letter-spacing:-.02em;text-transform:uppercase;max-width:18ch">
    A window <span style="color:var(--sig);text-shadow:0 0 40px rgba(0,255,156,.5)">is</span> a capability
  </div>
  <div style="font-family:var(--sans);font-size:28px;color:var(--dim);margin-top:36px;max-width:52ch;line-height:1.5">
    An unforgeable, attenuable reference that confers exactly the authority it names — and nothing more. <span style="color:var(--phos)">Take nobody's word for it.</span>
  </div>
  <div style="display:flex;gap:16px;margin-top:44px;font-family:var(--mono);font-size:17px">
    <span class="chip">CELLS</span><span class="chip">TURNS</span><span class="chip">RECEIPTS</span>
    <span class="chip" style="border-color:rgba(255,255,255,.14);background:transparent;color:var(--dim)">ED25519 · HMAC · HASH-CHAIN</span>
  </div>
</div>` });

// 4 — Guarantees ledger 1600x900
const G = [
  ["A", "AUTHORITY", "Every change is a fresh, non-amplified token chain.", "ed25519 · hmac"],
  ["B", "CONSERVATION", "Per asset, the sum is identically zero. Value only moves.", "integer arithmetic"],
  ["C", "INTEGRITY", "A receipt binds the whole post-state. Tamper → rejected.", "collision-resistance"],
  ["D", "FRESHNESS", "No replay, no double-spend. A spent nonce is dead.", "nullifier set"],
  ["E", "UNFOOLABILITY", "A light client learns A–D for the whole history.", "hash-chain · ed25519"],
];
scenes.push({ name: "nullius-guarantees", w: 1600, h: 900, body: `
<div style="width:100%;flex-direction:column;justify-content:center;padding:70px 110px">
  <div class="mono" style="font-size:24px;letter-spacing:.28em;color:var(--sig);text-transform:uppercase;margin-bottom:14px">// the assurance case</div>
  <div class="mono" style="font-size:56px;font-weight:700;text-transform:uppercase;margin-bottom:40px">A light client cannot be fooled</div>
  <div style="display:flex;flex-direction:column;gap:16px">
    ${G.map(([l, n, s, f]) => `
    <div style="display:grid;grid-template-columns:88px 1fr;gap:28px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:22px 28px;background:var(--void)">
      <div style="width:70px;height:70px;display:grid;place-items:center;font-family:var(--mono);font-weight:700;font-size:36px;color:var(--sig);border:1px solid rgba(0,255,156,.3);border-radius:8px;background:rgba(0,255,156,.06);box-shadow:0 0 24px rgba(0,255,156,.14)">${l}</div>
      <div>
        <div class="mono" style="font-size:22px;letter-spacing:.12em;color:var(--phos);margin-bottom:6px">${n}</div>
        <div style="font-family:var(--sans);font-size:20px;color:var(--dim)">${s} <span class="mono" style="color:var(--mut);font-size:15px">· floor: ${f}</span></div>
      </div>
    </div>`).join("")}
  </div>
</div>` });

// 5 — How it works 1600x900
scenes.push({ name: "nullius-howitworks", w: 1600, h: 900, body: `
<div style="width:100%;flex-direction:column;justify-content:center;padding:70px 100px">
  <div class="mono" style="font-size:24px;letter-spacing:.28em;color:var(--sig);text-transform:uppercase;margin-bottom:14px">// the kernel underneath</div>
  <div class="mono" style="font-size:56px;font-weight:700;text-transform:uppercase;margin-bottom:54px">Cells · Turns · Receipts</div>
  <div style="display:flex;align-items:stretch;gap:0">
    ${[["01", "CELLS", "State behind its own predicate. Nothing is ownerless; a budget that cannot be exceeded is a cell whose program says so."],
       ["02", "TURNS", "An atomic, ed25519-signed batch. Each action shows a capability — narrowable, never amplifiable. All-or-nothing."],
       ["03", "RECEIPTS", "A committed turn leaves Q, binding the whole post-state. Receipts chain by hash; a stranger verifies the lot."]]
      .map(([nn, t, d], i) => `
    <div style="flex:1;border:1px solid var(--line);border-left:3px solid var(--sig);border-radius:10px;padding:32px 30px;background:var(--void);position:relative">
      <div class="mono" style="font-size:16px;letter-spacing:.14em;color:var(--sig);margin-bottom:16px">${nn}</div>
      <div class="mono" style="font-size:30px;font-weight:700;margin-bottom:18px">${t}</div>
      <div style="font-family:var(--sans);font-size:19px;color:var(--dim);line-height:1.55">${d}</div>
    </div>${i < 2 ? `<div style="display:flex;align-items:center;padding:0 22px;color:var(--sig);font-size:40px;font-family:var(--mono)">→</div>` : ""}`).join("")}
  </div>
  <div class="mono" style="margin-top:44px;font-size:19px;color:var(--dim);text-align:center">
    one executor · runs in the node <span style="color:var(--sig)">and</span> your browser · re-verify, trusting no one
  </div>
</div>` });

// 6 — OG card 1200x630
scenes.push({ name: "nullius-og", w: 1200, h: 630, body: `
<div style="width:100%;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 90px;gap:26px">
  <div style="display:flex;align-items:center;gap:22px">
    <div style="width:82px;height:82px;display:grid;place-items:center;border:2px solid rgba(0,255,156,.35);border-radius:18px;background:rgba(0,255,156,.05);box-shadow:0 0 44px rgba(0,255,156,.22)"><div class="mark" style="font-size:56px">∅</div></div>
    <div class="mono" style="font-size:72px;font-weight:700;letter-spacing:.14em">NULLIUS</div>
  </div>
  <div class="mono" style="font-size:34px;color:var(--sig);letter-spacing:.04em;text-shadow:0 0 22px rgba(0,255,156,.4)">take nobody's word for it.</div>
  <div style="font-family:var(--sans);font-size:23px;color:var(--dim);max-width:56ch;line-height:1.5">A verified capability substrate — a window <span style="color:var(--phos)">is</span> a capability. The kernel runs in your browser; verify before you believe.</div>
  <div style="margin-top:10px"><span class="chip" style="font-size:16px"><span class="dot"></span>$NULL · SOLANA</span></div>
</div>` });

/* ---- render -------------------------------------------------------------- */
async function render() {
  if (!existsSync(CHROME)) { console.error("Chrome not found at", CHROME); process.exit(1); }
  await mkdir(TMP, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const profile = join(TMP, "cprofile");

  for (const sc of scenes) {
    const html = page(sc.w, sc.h, sc.body);
    const htmlPath = join(TMP, sc.name + ".html");
    await writeFile(htmlPath, html, "utf8");
    const url = pathToFileURL(htmlPath).href; // ABSOLUTE file:// — the tell if relative
    const outPath = join(OUT, sc.name + ".png");
    const args = [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`,
      `--window-size=${sc.w},${sc.h}`,
      "--default-background-color=00000000",
      "--virtual-time-budget=2200",
      `--screenshot=${outPath}`,
      url,
    ];
    try {
      await pexec(CHROME, args, { timeout: 45000 });
      const s = await stat(outPath);
      console.log(`  ✓ ${sc.name}.png  ${sc.w}x${sc.h}  ${(s.size / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.error(`  ✗ ${sc.name}:`, e.message);
    }
  }
  console.log("\nbrand/ →", OUT);
}
render();
