'use strict';
// שמירה, טעינה והפעלה
/* ---------- 15. SAVE / LOAD ---------- */
function save() {
  if (S?.demo) return;   // משחק הרקע של מסך הבית לא נשמר
  try { const { terrain, owner, lastOwner, railMap, core, capDay, ...rest } = S; localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({ ...rest, owner: Array.from(owner), lastOwner: Array.from(lastOwner), railMap: Array.from(railMap), core: Array.from(core), capDay: Array.from(capDay, v => Math.round(v)) })); } catch (e) { /* אין אחסון */ }
}
function load() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY); if (!raw) return false;
    const d = JSON.parse(raw); if (d.v !== 10) return false;
    const m = loadTerrain(d.settings, d.seed);
    S = { ...d, terrain: m.terrain, owner: Int8Array.from(d.owner), lastOwner: Int8Array.from(d.lastOwner), railMap: Uint8Array.from(d.railMap), core: Int8Array.from(d.core), capDay: Float32Array.from(d.capDay) };
    view.railDirty = true;
    for (const k in compCache) delete compCache[k];
    buildTerrainCanvas(); view.ownerDirty = true; spriteCache.clear(); SHEET.tinted.clear(); iconURLs = null;
    const cap = Object.keys(S.buildings).find(k => S.buildings[k].n === 0);
    centerOn(cap != null ? +cap : Math.max(0, S.owner.indexOf(0)));
    return true;
  } catch (e) { console.error(e); return false; }
}

/* ---------- 16. BOOT & LOOP ---------- */
let last = performance.now(), acc = 0, lastUi = 0;
function loop(now) {
  const real = Math.min(0.25, (now - last) / 1000); last = now;
  if (S && !S.over && S.speed > 0 && (!modalOpen() || S.demo)) {
    acc += real * S.speed / CFG.DAY_SEC; let n = 0;
    while (acc >= CFG.TICK && n++ < 20) { step(CFG.TICK); acc -= CFG.TICK; }
    if (n >= 20) acc = 0;
  }
  view.anim = now / 380; if (S?.demo) homePan(real); draw();
  if (now - lastUi > 250) { lastUi = now; updateLive(); }
  requestAnimationFrame(loop);
}
resize();
loadSprites().then(() => { showHome(); requestAnimationFrame(loop); });
