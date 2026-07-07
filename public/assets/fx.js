// NULLIUS — ambient effects. Hex-rain, decrypt-text, scroll reveals.
// Kept deliberately light; respects prefers-reduced-motion.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- hex-rain canvas ---------------------------------------------------- */
(function hexRain() {
  if (reduce) return;
  const c = document.getElementById("hexbg");
  if (!c) return;
  const ctx = c.getContext("2d");
  const HEX = "0123456789abcdef";
  let cols = [], w = 0, h = 0, fs = 14;
  function resize() {
    w = c.width = innerWidth; h = c.height = innerHeight;
    const n = Math.floor(w / (fs * 1.2));
    cols = Array.from({ length: n }, () => ({
      y: Math.random() * -h,
      speed: 0.4 + Math.random() * 0.9,
      len: 6 + Math.floor(Math.random() * 18),
    }));
  }
  resize(); addEventListener("resize", resize);
  ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`;
  let last = 0;
  function frame(t) {
    if (t - last > 55) {
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const x = i * fs * 1.2 + 4;
        for (let j = 0; j < col.len; j++) {
          const yy = col.y - j * fs;
          if (yy < 0 || yy > h) continue;
          const head = j === 0;
          const a = head ? 0.55 : Math.max(0, 0.22 - j * 0.014);
          ctx.fillStyle = head ? `rgba(0,255,156,${a})` : `rgba(120,180,160,${a})`;
          ctx.fillText(HEX[(Math.random() * 16) | 0], x, yy);
        }
        col.y += col.speed * fs * 0.5;
        if (col.y - col.len * fs > h) { col.y = Math.random() * -80; col.speed = 0.4 + Math.random() * 0.9; }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ---- decrypt-text: scramble then resolve -------------------------------- */
export function decrypt(el, opts = {}) {
  const final = opts.text ?? el.textContent;
  const glyphs = "!<>-_\\/[]{}=+*^?#01ABCDEF∅";
  if (reduce) { el.textContent = final; return; }
  let frame = 0, stopped = false;
  const queue = [...final].map((ch, i) => ({
    ch, start: Math.floor(i * 1.4), end: Math.floor(i * 1.4) + 8 + Math.floor(Math.random() * 10),
  }));
  // Hard safety net: no matter what rAF does (throttled/backgrounded tab),
  // the real text is guaranteed on screen shortly. The headline is never broken.
  const safety = setTimeout(() => { stopped = true; el.textContent = final; }, 1400);
  function tick() {
    if (stopped) return;
    let out = "", done = 0;
    for (const q of queue) {
      if (frame >= q.end) { out += q.ch; done++; }
      else if (frame >= q.start) out += `<span style="color:var(--muted)">${glyphs[(Math.random() * glyphs.length) | 0]}</span>`;
    }
    el.innerHTML = out;
    if (done < queue.length) { frame++; requestAnimationFrame(tick); }
    else { clearTimeout(safety); el.textContent = final; }
  }
  requestAnimationFrame(tick);
}

document.querySelectorAll("[data-decrypt]").forEach((el) => {
  // Keep the text present (accessible / crawlable / fail-safe); animate over it.
  const t = el.textContent;
  requestAnimationFrame(() => decrypt(el, { text: t }));
});

/* ---- scroll reveal ------------------------------------------------------ */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---- copy-on-click (CA, etc.) ------------------------------------------- */
document.querySelectorAll("[data-copy]").forEach((el) => {
  el.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.dataset.copy);
      const old = el.querySelector("[data-copy-label]") || el;
      const prev = old.textContent;
      old.textContent = "COPIED ✓";
      setTimeout(() => (old.textContent = prev), 1200);
    } catch {}
  });
});
