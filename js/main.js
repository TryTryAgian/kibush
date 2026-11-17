'use strict';
// שמירה, טעינה והפעלה
/* ---------- 15. SAVE / LOAD ---------- */
// דחיסת מערכי המפה: רצפים של אותו ערך (RLE) על הבתים, ואז base64. מפת בעלות של 115 אלף משבצות → כמה עשרות KB
function packBytes(u8) {
  const out = []; for (let i = 0; i < u8.length;) { const v = u8[i]; let n = 1; while (n < 255 && i + n < u8.length && u8[i + n] === v) n++; out.push(v, n); i += n; }
  const b = new Uint8Array(out); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s);
}
function unpackBytes(str, len) {
  const s = atob(str), u = new Uint8Array(len); let k = 0;
  for (let i = 0; i < s.length; i += 2) { const v = s.charCodeAt(i), n = s.charCodeAt(i + 1); u.fill(v, k, k + n); k += n; }
  return u;
}
const packArr = a => packBytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const unpackArr = (str, Type, n) => new Type(unpackBytes(str, n * Type.BYTES_PER_ELEMENT).buffer);
function save() {
  if (S?.demo) return;   // משחק הרקע של מסך הבית לא נשמר
  try {
    const { terrain, owner, lastOwner, railMap, core, capDay, ...rest } = S;
    const cap = Uint16Array.from(capDay, v => clamp(Math.round(v), 0, 65535));
    // מפות זמני ההגעה של המבצעים (landF) — חישוב זמני ענק; לא שומרים, מחושבים מחדש בטעינה
    const ops = rest.ops.map(({ landF, ...o }) => o);
    const divs = rest.divs.map(({ gf, ...d }) => d);
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({ ...rest, ops, divs, packed: 1, owner: packArr(owner), lastOwner: packArr(lastOwner), railMap: packArr(railMap), core: packArr(core), capDay: packArr(cap) }));
  } catch (e) { if (!S.saveWarned) { S.saveWarned = true; toast('⚠ השמירה נכשלה — אין מספיק מקום באחסון של הדפדפן', 'bad'); } }
}
function load() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY); if (!raw) return false;
    const d = JSON.parse(raw); if (d.v !== 10) return false;
    const m = loadTerrain(d.settings, d.seed);
    const N = m.terrain.length, P = d.packed;
    S = { ...d, terrain: m.terrain, owner: P ? unpackArr(d.owner, Int8Array, N) : Int8Array.from(d.owner), lastOwner: P ? unpackArr(d.lastOwner, Int8Array, N) : Int8Array.from(d.lastOwner), railMap: P ? unpackArr(d.railMap, Uint8Array, N) : Uint8Array.from(d.railMap), core: P ? unpackArr(d.core, Int8Array, N) : Int8Array.from(d.core), capDay: P ? Float32Array.from(unpackArr(d.capDay, Uint16Array, N)) : Float32Array.from(d.capDay) };
    delete S.packed;
    view.railDirty = true;
    for (const k in compCache) delete compCache[k];
    for (const op of S.ops) planOp(op);   // מחשבים מחדש את הציר ומפת ההגעה
    buildTerrainCanvas(); view.ownerDirty = true; spriteCache.clear(); SHEET.tinted.clear(); iconURLs = null;
    const cap = Object.keys(S.buildings).find(k => S.buildings[k].n === 0);
    centerOn(cap != null ? +cap : Math.max(0, S.owner.indexOf(0)));
    return true;
  } catch (e) { console.error(e); return false; }
}

/* ---------- 16. BOOT & LOOP ---------- */
let last = performance.now(), acc = 0, lastUi = 0;
// החלקת תנועה: הסימולציה מתקדמת בצעדים (כל 0.3 שניות במהירות ×1); בציור משלבים בין המיקום הקודם לנוכחי לפי הזמן שעבר מאז הצעד
function snapPrev() { if (!S) return; for (const f of S.fronts) f.pp = [f.pos[0], f.pos[1]]; for (const c of S.convoys) { c.pt = c.t; c.pPath = c.path; } for (const r of S.rails) { r.pt = r.t; r.pPath = r.path; } }
const IP = [];
const FOGSW = { on: false };
function interpBegin() {
  IP.length = 0; const a = view.alpha ?? 1;
  if (S && fogOn()) {   // ערפל: בזמן הציור — רק מה שהשחקן רואה
    FOGSW.on = true; FOGSW.f = S.fronts; FOGSW.c = S.convoys; FOGSW.r = S.rails;
    S.fronts = S.fronts.filter(f => !fogHide(f.n, f.pos[0], f.pos[1]));
    S.convoys = S.convoys.filter(c => { const [x, y] = pathPos(c.path, c.t); return !fogHide(c.n, x, y); });
    S.rails = S.rails.filter(r => { const [x, y] = pathPos(r.path, r.t); return !fogHide(r.n, x, y); });
  }
  if (!S || a >= 1) return;
  for (const f of S.fronts) if (f.pp && Math.abs(f.pp[0] - f.pos[0]) + Math.abs(f.pp[1] - f.pos[1]) < 3 * G) { IP.push([f, 'pos', f.pos]); f.pos = [f.pp[0] + (f.pos[0] - f.pp[0]) * a, f.pp[1] + (f.pos[1] - f.pp[1]) * a]; }
  for (const c of [...S.convoys, ...S.rails]) if (c.pt != null && c.pPath === c.path) { IP.push([c, 't', c.t]); c.t = c.pt + (c.t - c.pt) * a; }
}
function interpEnd() { if (FOGSW.on) { S.fronts = FOGSW.f; S.convoys = FOGSW.c; S.rails = FOGSW.r; FOGSW.on = false; } for (const [o, k, v] of IP) o[k] = v; IP.length = 0; }
const vTime = () => S.time - (1 - (view.alpha ?? 1)) * (S.speed > 0 ? CFG.TICK : 0);
function loop(now) {
  const real = Math.min(0.25, (now - last) / 1000); last = now;
  if (S && !S.over && S.speed > 0 && (!modalOpen() || S.demo)) {
    acc += real * S.speed / CFG.DAY_SEC; let n = 0;
    while (acc >= CFG.TICK && n++ < 20) { snapPrev(); step(CFG.TICK); acc -= CFG.TICK; }
    if (n >= 20) acc = 0;
  }
  view.alpha = S && S.speed > 0 && !S.demo ? clamp(acc / CFG.TICK, 0, 1) : 1;
  // משחק הרקע של מסך הבית: ריצה מהירה קדימה בתקציב של ~10ms לפריים
  if (S?.demo && S.warmTo && S.time < S.warmTo) { const t0 = performance.now(); while (S.time < S.warmTo && performance.now() - t0 < 10) step(CFG.TICK); }
  view.anim = now / 380; if (S?.demo) homePan(real); interpBegin(); try { draw(); } finally { interpEnd(); }
  if (now - lastUi > 250) { lastUi = now; updateLive(); }
  requestAnimationFrame(loop);
}
resize();
loadSprites().then(() => { showHome(); requestAnimationFrame(loop); });
