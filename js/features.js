'use strict';
// ===================== נהרות, גשרים, תוואי שטח וגזרות =====================
// נהרות: נוצרים פעם אחת עם המפה — זורמים מההרים והגבעות אל הים. חציית נהר יקרה (תנועה) וקשה (הגנה), חוץ מגשר.
// תוואי שטח (OAKOC): גבעות שולטות, מעברי הרים, מיצרים, עמקים, מפרצים, יערות וגשרים — עם שם, ערך וטווח שליטה.
// גזרות: המפה מחולקת לגזרות סביב התוואים (הגבולות עוברים בנהרות וברכסים). מי שמחזיק את תוואי המפתח של גזרה
// ואת רוב השטח שלה — השטח הפתוח שנשאר בה נופל לידיו בהדרגה. כך הכיבוש הוא תפיסת מקומות, לא צביעת משבצות.
/* ---------- FEATURES ---------- */
const RIVER_X = 3.2;                       // תוספת עלות תנועה לחציית נהר (גשר: בלי תוספת)
const riverAt = j => S.river ? S.river[j] : 0;   // 0 = אין, 1 = נהר, 2 = גשר
const riverCost = v => S.river && S.river[v] === 1 ? RIVER_X : 0;
const FNAMES = ['האלון', 'הזיתים', 'השקד', 'הצבאים', 'הרוח', 'הנשרים', 'האבן', 'התמרים', 'השועל', 'הברושים', 'הענבים', 'הזאב', 'האורנים', 'החרוב', 'הדולב', 'הערבה',
  'הכרמים', 'השחר', 'הסלע', 'השיטה', 'האלה', 'הרימונים', 'התאנה', 'הצופים', 'היונים', 'האיילות', 'המעיין', 'השדות', 'הקשת', 'הלהבה', 'הגיבורים', 'הכוכב', 'הסער',
  'הלבונה', 'העורבים', 'הנמר', 'הדבורים', 'הפרסה', 'המגדל', 'החומה', 'הענן', 'הברק', 'השיבולים', 'הצרעה', 'הקוצים', 'הגפן', 'החצב', 'הכלנית', 'הבזלת', 'הצפצפה',
  'הבשן', 'הקברים', 'השלוש', 'הפעמון', 'הצריח', 'הגחלים', 'השושנים', 'הירח', 'העוז', 'הצוקים', 'הכפיר', 'החוליות', 'הדקלים', 'הארזים', 'העופרת', 'הנחושת'];
const RIVNAMES = ['הירדן הקטן', 'הקישון', 'השורק', 'הירקון', 'האלכסנדר', 'התנינים', 'הבשור', 'לכיש', 'עמוד', 'כזיב', 'נעמן', 'גדורה', 'צלמון', 'חרוד', 'דן', 'שניר', 'פולג', 'חדרה'];
// type → סמל, תחילית לשם, ערך כיעד, טווח שליטה (יחידות), הסבר
const FT = {
  hill:   { ic: '▲', pre: 'גבעת',  val: 4, r: 2.5, def: 1.15, why: 'קרקע שולטת: תצפית, אש מלמעלה ובונוס הגנה' },
  pass:   { ic: '⛰', pre: 'מעבר',  val: 6, r: 2,   def: 1.3,  why: 'צוואר בקבוק בין הרים — כוח קטן עוצר בו צבא' },
  strait: { ic: '⧗', pre: 'מיצר',  val: 6, r: 2,   def: 1.3,  why: 'רצועת יבשה צרה בין מים — הדרך היחידה ביבשה' },
  bridge: { ic: '🌉', pre: 'גשר',   val: 5, r: 1.5, def: 1.25, why: 'מעבר יבש על הנהר — בלעדיו החצייה איטית ויקרה' },
  valley: { ic: '🏞', pre: 'עמק',   val: 3, r: 3,   def: 1,    why: 'פרוזדור תנועה בין רכסים — ציר מהיר לשריון' },
  bay:    { ic: '⚓', pre: 'מפרץ',  val: 3, r: 3,   def: 1.05, why: 'חוף מוגן — נמל ונחיתה' },
  forest: { ic: '🌲', pre: 'יער',   val: 2, r: 3,   def: 1.1,  why: 'מחסה והסתרה לחי״ר; שריון נאט בו' },
};
const FEAT = { s: null, list: [], near: null, sec: null, secs: [] };
const lowland = t => t === GRASS || t === FOREST || t === SAND;

/* ---- נהרות ---- */
function genRivers() {
  const N = W * H, river = new Uint8Array(N), rnd = mulberry32((S.seed | 0) + 777), D = new Int32Array(N).fill(-1), q = [];
  for (let i = 0; i < N; i++) if (isWater(i)) { D[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (D[v] < 0) { D[v] = D[u] + 1; q.push(v); } }
  // Dijkstra מכל המים: עלות לכל משבצת = רעש חלק + שטח (הרים יקרים) — prev = הכיוון שבו הנהר זורם
  const nz = makeNoise((S.seed | 0) + 913), cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), hp = new Heap();
  for (let i = 0; i < N; i++) if (isWater(i)) { cost[i] = 0; hp.push(0, i); }
  while (hp.size) {
    const [cu, u] = hp.pop(); if (cu > cost[u]) continue;
    for (const v of nb4(u)) { if (isWater(v)) continue; const [x, y] = XY(v), t = S.terrain[v];
      const w = 0.3 + 1.9 * nz(x / (3.5 * G), y / (3.5 * G), 3) + 1.3 * nz(x / (1.1 * G) + 50, y / (1.1 * G) - 30, 2) + (t === MOUNT ? 1.2 : t === HILLS ? 0.5 : t === SNOW ? 3 : 0);
      if (cu + w < cost[v]) { cost[v] = cu + w; prev[v] = u; hp.push(cost[v], v); } }
  }
  const cands = []; for (let i = 0; i < N; i++) { const t = S.terrain[i]; if ((t === HILLS || t === MOUNT) && D[i] >= 6 * G && (i % W) % 3 === 0 && ((i / W) | 0) % 3 === 0) cands.push(i); }
  for (let k = cands.length - 1; k > 0; k--) { const r = (rnd() * (k + 1)) | 0; [cands[k], cands[r]] = [cands[r], cands[k]]; }
  const want = Math.max(3, Math.round(N / (G * G) / 650)), rivers = [], near = (i, R) => { const [x, y] = XY(i); for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy += 2) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx += 2) if (river[yy * W + xx]) return true; return false; };
  for (const src of cands) {
    if (rivers.length >= want) break;
    if (near(src, 6 * G)) continue;
    // הנהר יורד בעץ "המסלול הזול ביותר לים" — עלות רועשת יוצרת פיתולים, ויובלים מתאחדים מעצמם
    const path = [src]; let cur = src, joined = false, sea = false;
    for (let step = 0; step < 8000; step++) {
      const nx = prev[cur]; if (nx < 0) break;
      if (isWater(nx)) { sea = true; break; }
      cur = nx; path.push(cur);
      if (river[cur]) { joined = true; break; }
    }
    if ((!sea && !joined) || path.length < 7 * G) continue;
    for (const j of path) if (!river[j]) river[j] = 1;
    rivers.push({ tiles: path, name: 'נחל ' + RIVNAMES[rivers.length % RIVNAMES.length] });
  }
  // גשרים: לאורך כל נהר, כל 7–10 יחידות, במקום ישר בשפלה
  for (const r of rivers) {
    let last = -99;
    for (let k = 2; k < r.tiles.length - 2; k++) {
      const j = r.tiles[k]; if (k - last < (7 + rnd() * 3) * G) continue;
      if (!lowland(S.terrain[j])) continue;
      if (nb4(j).filter(v => river[v]).length !== 2) continue;
      river[j] = 2; last = k;
    }
  }
  S.river = river; S.rivers = rivers;
}
// גשר ליד בירות וערי כפרים שעל נהר (אחרי הצבת הערים)
function townBridges() {
  if (!S.river) return; const towns = [];
  eachBuilding((b, j) => { if (b.capital) towns.push(j); });
  for (const m of S.minors || []) if (m.town != null) towns.push(m.town);
  for (const t of towns) {
    if (S.river[t]) { S.river[t] = 2; continue; }
    const [x, y] = XY(t), R = Math.round(2.5 * G); let best = -1, bd = Infinity;
    for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) { const j = yy * W + xx; if (S.river[j] === 2) { bd = -1; break; } if (S.river[j] === 1 && nb4(j).filter(v => S.river[v]).length === 2) { const d = Math.hypot(xx - x, yy - y); if (d < bd) { bd = d; best = j; } } }
    if (best >= 0 && bd > 0) S.river[best] = 2;
  }
}

/* ---- תוואי שטח ---- */
function features() {
  if (FEAT.s === S && FEAT.ver === (S.river ? 1 : 0)) return FEAT.list;
  FEAT.s = S; FEAT.ver = S.river ? 1 : 0;
  const N = W * H, out = [], used = new Set(), rnd = mulberry32((S.seed | 0) + 4242);
  const name = t => { const pool = FNAMES.filter(n => !used.has(t + n)); const n = pool.length ? pool[(rnd() * pool.length) | 0] : FNAMES[(rnd() * FNAMES.length) | 0] + ' ' + (out.length + 1); used.add(t + n); return FT[t].pre + ' ' + n; };
  const add = (t, tile) => out.push({ id: out.length, t, tile, name: name(t) });
  const far = (tile, R, types) => !out.some(f => (!types || types.includes(f.t)) && dist(f.tile, tile) < R);
  // גשרים ומעברי הרים
  for (let j = 0; j < N; j++) if (riverAt(j) === 2 && far(j, 3, ['bridge'])) add('bridge', j);
  for (const p of passes()) if (far(p.tile, 3)) add('pass', p.tile);
  // מיצרים: יבשה צרה ששני צדדיה מים, ופתוחה לשני הכיוונים לאורכה
  { const MAXW = Math.round(2.6 * G), STEP = Math.max(1, G >> 1), DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]], cand = [];
    for (let y = 2; y < H - 2; y += STEP) for (let x = 2; x < W - 2; x += STEP) {
      const t = y * W + x; if (isWater(t) || S.terrain[t] === SNOW) continue;
      for (const [dx, dy] of DIRS) {
        const px = -dy, py = dx; let a = 0, b = 0, ok = true;
        for (a = 1; a <= MAXW; a++) { const X = x + px * a, Y = y + py * a; if (X < 0 || Y < 0 || X >= W || Y >= H) { ok = false; break; } if (isWater(idx(X, Y))) break; }
        for (b = 1; b <= MAXW; b++) { const X = x - px * b, Y = y - py * b; if (X < 0 || Y < 0 || X >= W || Y >= H) { ok = false; break; } if (isWater(idx(X, Y))) break; }
        if (!ok || a > MAXW || b > MAXW) continue;
        let open = 0; for (const sg of [1, -1]) for (const L of [2, 4]) { const X = x + dx * sg * L * G, Y = y + dy * sg * L * G; if (X >= 0 && Y >= 0 && X < W && Y < H && !isWater(idx(X, Y))) open++; }
        if (open < 4) continue;
        cand.push({ t, w: (a + b) * (dx && dy ? 1.41 : 1) }); break;
      }
    }
    cand.sort((p, q) => p.w - q.w); for (const c of cand) if (far(c.t, 5, ['strait', 'pass', 'bridge'])) add('strait', c.t);
  }
  // גבעות ויערות: בתוך כל גוש — נקודות "עמוקות" (רחוקות מהשוליים), במרווחים
  const peaks = (T_, minSize, spacing, minIn, test) => {
    const comp = new Int32Array(N).fill(-1), inner = new Int16Array(N); let cid = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] >= 0 || S.terrain[s] !== T_) continue;
      const tiles = [s]; comp[s] = cid;
      for (let h = 0; h < tiles.length; h++) for (const v of nb4(tiles[h])) if (comp[v] < 0 && S.terrain[v] === T_) { comp[v] = cid; tiles.push(v); }
      cid++;
      if (tiles.length < minSize) continue;
      const qq = []; for (const j of tiles) if (nb4(j).some(v => S.terrain[v] !== T_)) { inner[j] = 1; qq.push(j); }
      for (let h = 0; h < qq.length; h++) for (const v of nb4(qq[h])) if (S.terrain[v] === T_ && !inner[v]) { inner[v] = inner[qq[h]] + 1; qq.push(v); }
      const order = tiles.filter(j => inner[j] >= minIn).sort((a, b) => inner[b] - inner[a]), mine = [];
      for (const j of order) { if (mine.some(m => dist(m, j) < spacing)) continue; if (test && !test(j)) continue; mine.push(j); if (mine.length > 12) break; }
      for (const j of mine) if (far(j, 3)) add(T_ === HILLS ? 'hill' : 'forest', j);
    }
  };
  const overlooks = j => { const [x, y] = XY(j), R = 3 * G; let lo = 0, n = 0; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, X = Math.round(x + Math.cos(a) * R), Y = Math.round(y + Math.sin(a) * R); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; n++; if (lowland(S.terrain[idx(X, Y)])) lo++; } return n && lo / n >= 0.35; };
  peaks(HILLS, 2 * G * G, 7, 2, overlooks);
  peaks(FOREST, 4 * G * G, 11, Math.max(3, G), null);
  // עמקים: שפלה צרה (עד 5 יחידות) שבשני צדדיה רמה — לאורך לפחות 6 יחידות
  { const high = j => { const t = S.terrain[j]; return t === HILLS || t === MOUNT || t === SNOW; }, MAXW = 5 * G, STEP = G, DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]], cand = [];
    const across = (x, y, px, py) => { let a, b; for (a = 1; a <= MAXW; a++) { const X = x + px * a, Y = y + py * a; if (X < 0 || Y < 0 || X >= W || Y >= H) return null; const j = idx(X, Y); if (isWater(j)) return null; if (high(j)) break; } for (b = 1; b <= MAXW; b++) { const X = x - px * b, Y = y - py * b; if (X < 0 || Y < 0 || X >= W || Y >= H) return null; const j = idx(X, Y); if (isWater(j)) return null; if (high(j)) break; } return a > MAXW || b > MAXW ? null : a + b; };
    for (let y = 2; y < H - 2; y += STEP) for (let x = 2; x < W - 2; x += STEP) {
      const t = y * W + x; if (!lowland(S.terrain[t])) continue;
      for (const [dx, dy] of DIRS) {
        const px = -dy, py = dx, w0 = across(x, y, px, py); if (w0 == null || w0 < 1.5 * G) continue;
        let ok = true; for (const sg of [1, -1]) { const X = x + dx * sg * 3 * G, Y = y + dy * sg * 3 * G; if (X < 0 || Y < 0 || X >= W || Y >= H || !lowland(S.terrain[idx(X, Y)]) || across(X, Y, px, py) == null) { ok = false; break; } }
        if (ok) { cand.push({ t, w: w0 }); break; }
      }
    }
    cand.sort((p, q) => p.w - q.w); for (const c of cand) if (far(c.t, 9, ['valley']) && far(c.t, 4, ['pass', 'strait'])) add('valley', c.t);
  }
  // מפרצים: מים שהיבשה סוגרת עליהם מרוב הכיוונים (לא אגם סגור) — התוואי הוא החוף הפנימי
  { const STEP = G, R = 7 * G;
    for (let y = 2; y < H - 2; y += STEP) for (let x = 2; x < W - 2; x += STEP) {
      const t = y * W + x; if (!isWater(t)) continue; let hit = 0, n = 0;
      for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; n++; for (let r = 1; r <= R; r++) { const X = Math.round(x + Math.cos(a) * r), Y = Math.round(y + Math.sin(a) * r); if (X < 0 || Y < 0 || X >= W || Y >= H) break; if (!isWater(idx(X, Y))) { hit++; break; } } }
      if (hit / n < 0.62 || hit === n) continue;
      let best = -1, bd = Infinity; const R2 = 3 * G;
      for (let yy = Math.max(0, y - R2); yy <= Math.min(H - 1, y + R2); yy++) for (let xx = Math.max(0, x - R2); xx <= Math.min(W - 1, x + R2); xx++) { const j = yy * W + xx; if (!lowland(S.terrain[j]) || !nb4(j).some(isWater)) continue; const d = Math.hypot(xx - x, yy - y); if (d < bd) { bd = d; best = j; } }
      if (best >= 0 && far(best, 10, ['bay'])) add('bay', best);
    }
  }
  // שמות לנהרות (שמירה ישנה בלי שמות)
  FEAT.list = out; FEAT.near = null; FEAT.sec = null;
  return out;
}
// התוואי הקרוב לנקודה (בטווח השליטה שלו)
function featNear() {
  const fs = features(); if (FEAT.near) return FEAT.near;
  const near = new Int16Array(W * H).fill(-1), bd = new Float32Array(W * H).fill(Infinity);
  for (const f of fs) { const [x, y] = XY(f.tile), R = Math.ceil(FT[f.t].r * G); for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) { const d = Math.hypot(xx - x, yy - y); if (d <= R && d < bd[yy * W + xx]) { bd[yy * W + xx] = d; near[yy * W + xx] = f.id; } } }
  return FEAT.near = near;
}
function featAt(j, slack = 0) {
  if (!slack) { const k = featNear()[j]; return k >= 0 ? FEAT.list[k] : null; }
  const fs = features(); let best = null, bd = Infinity;
  for (const f of fs) { const d = dist(f.tile, j); if (d <= FT[f.t].r + slack && d < bd) { bd = d; best = f; } }
  return best;
}
const featById = id => features()[id];
const featLabel = f => `${FT[f.t].ic} ${f.name}`;
// בונוס הגנה לכוח שעומד בתוואי (שלו): צווארי בקבוק וגבעות
function featDef(f) {
  if (f.kind !== 'land') return 1;
  const t = tileOf(f.pos[0], f.pos[1]), ft = featAt(t); let k = ft && S.owner[ft.tile] === f.n ? FT[ft.t].def : 1;
  // מגן מאחורי נהר: יש נהר (לא גשר) ממש לפניו
  if (S.river && f.role !== 'attack') { const [x, y] = f.pos, R = G; outer: for (let yy = Math.max(0, Math.round(y - R)); yy <= Math.min(H - 1, Math.round(y + R)); yy++) for (let xx = Math.max(0, Math.round(x - R)); xx <= Math.min(W - 1, Math.round(x + R)); xx++) if (S.river[yy * W + xx] === 1) { k *= 1.2; break outer; } }
  return k;
}

/* ---- גזרות ---- */
function sectors() {
  if (FEAT.sec && FEAT.secS === S) return FEAT.secs;
  const fs = features(), N = W * H, sec = new Int16Array(N).fill(-1), d = new Float64Array(N).fill(Infinity), heap = new Heap(), secs = [];
  const seed = (tile, feat) => { const id = secs.length; secs.push({ id, key: tile, feat, tiles: null, owner: -1, n: 0 }); d[tile] = 0; sec[tile] = id; heap.push(0, tile); };
  for (const f of fs) if (f.t !== 'bay' || true) seed(f.tile, f.id);
  // השלמה: אזורים בלי תוואי מקבלים גזרה סביב משבצת מרכזית
  const STEP = 8 * G;
  for (let y = STEP >> 1; y < H; y += STEP) for (let x = STEP >> 1; x < W; x += STEP) { const j = y * W + x; if (isWater(j) || S.terrain[j] === SNOW) continue; if (fs.some(f => dist(f.tile, j) < 6)) continue; seed(j, null); }
  while (heap.size) {
    const [du, u] = heap.pop(); if (du > d[u]) continue;
    for (const v of nb4(u)) {
      if (isWater(v)) continue;
      const w = Math.min(6, MOVE_COST[S.terrain[v]]) + (riverAt(v) === 1 ? 10 : 0);
      if (du + w < d[v]) { d[v] = du + w; sec[v] = sec[u]; heap.push(d[v], v); }
    }
  }
  const lists = secs.map(() => []); for (let j = 0; j < N; j++) if (sec[j] >= 0) lists[sec[j]].push(j);
  secs.forEach((s, k) => { s.tiles = Int32Array.from(lists[k]); s.n = s.tiles.length; });
  FEAT.sec = sec; FEAT.secs = secs; FEAT.secS = S;
  return secs;
}
const secOf = j => { sectors(); return FEAT.sec[j]; };
// יומי: גזרה שתוואי המפתח שלה ורוב השטח שלה בידי אומה — השטח הפתוח שנשאר בה נופל אליה בהדרגה
function sectorsDaily() {
  const secs = sectors();
  for (const s of secs) {
    const o = S.owner[s.key]; if (o < 0 || !S.nations[o]?.alive) { s.owner = -1; continue; }
    let mine = 0; for (const j of s.tiles) if (S.owner[j] === o) mine++;
    if (mine < s.n * 0.5 || mine === s.n) { s.owner = mine === s.n ? o : -1; continue; }
    const enemyArmy = S.fronts.filter(g => g.kind === 'land' && g.n !== o && atWar(o, g.n) && unitCount(g.units) && !g.flying);
    const cap = Math.max(2, Math.round(s.n * 0.08)); let got = 0, gotE = 0;
    for (const j of s.tiles) {
      if (got >= cap) break;
      const p = S.owner[j]; if (p === o || S.buildings[j] || isWater(j)) continue;
      if (p >= 0 ? !atWar(o, p) : (S.mnr && S.mnr[j] >= 0)) continue;
      if (!nb4(j).some(k => S.owner[k] === o)) continue;
      const [x, y] = XY(j); if (enemyArmy.some(g => hyp(g.pos[0] - x, g.pos[1] - y) < 2.5)) continue;
      if (p >= 0) gotE++; captureTile(o, j); got++;
    }
    if (gotE && s.owner !== o) {
      const f = s.feat != null ? featById(s.feat) : null, prevO = s.lastO;
      if (f && (o === 0 || s.lastO === 0) && s.toastT !== Math.floor(S.time)) { s.toastT = Math.floor(S.time); const [fx, fy] = XY(f.tile); if (typeof floatText === 'function') floatText(fx + 0.5, fy, o === 0 ? `✔ ${f.name}: הגזרה נופלת` : `✖ ${f.name}: הגזרה אבדה`, o === 0 ? '#5ad07a' : '#ff6060'); }
      s.lastO = o; void prevO;
    }
  }
}

/* ---- תעלות (שלב קרב ד׳) ---- */
// אוגדה בקו שעומדת במקום (מגינה, מרתקת, מחזיקה) חופרת: 4 ימים לתעלה מלאה. תזוזה של יותר מיחידה — מתחילים מחדש
function digDaily() {
  for (const d of S.divs) {
    if (d.loc !== 'front' || !d.pos) { d.dig = 0; d.digAt = null; continue; }
    const f = S.fronts.find(x => x.id === d.front); if (!f || f.kind !== 'land') { d.dig = 0; continue; }
    if (d.digAt && hyp(d.pos[0] - d.digAt[0], d.pos[1] - d.digAt[1]) > 1) { d.dig = 0; d.digAt = null; }
    const still = f.role !== 'attack' || ['fix', 'hold', 'support', 'reserve'].includes(d.task?.k);
    if (!still) { d.dig = Math.max(0, (d.dig || 0) - 0.5); continue; }
    if (!d.digAt) d.digAt = [d.pos[0], d.pos[1]];
    if ((d.dig || 0) < 0.3) {   // הכיוון נקבע כשמתחילים לחפור — אל הכוח העוין הקרוב
      let e = null, bd = 12; for (const g of S.fronts) if (g.kind === 'land' && g.n !== d.n && atWar(d.n, g.n) && unitCount(g.units)) { const dd = hyp(g.pos[0] - d.pos[0], g.pos[1] - d.pos[1]); if (dd < bd) { bd = dd; e = g; } }
      d.digH = e ? Math.atan2(e.pos[1] - d.pos[1], e.pos[0] - d.pos[0]) : frontHeading(f);
    }
    d.dig = Math.min(1, (d.dig || 0) + 0.25);
  }
}
const digBonus = f => { let s = 0, n = 0; for (const d of S.divs) if (d.front === f.id && d.line !== false && d.loc === 'front') { s += d.dig || 0; n++; } return n ? 1 + 0.3 * s / n : 1; };

/* ---- ציור ---- */
// גשרים (קורות עץ מעל המים), שמות נהרות ותוויות תוואים
function drawBridges(c, vis) {
  if (!S.river || view.cam.zoom < 0.7) return; const T = CFG.T;
  for (const f of features()) {
    if (f.t !== 'bridge') continue; const [x, y] = XY(f.tile), X = x * T + T / 2, Y = y * T + T / 2;
    if (vis && (X < vis.x0 - 12 || X > vis.x1 + 12 || Y < vis.y0 - 12 || Y > vis.y1 + 12)) continue;
    const horiz = S.river[f.tile - 1] || S.river[f.tile + 1];   // הנהר זורם אופקית → הגשר אנכי
    c.save(); c.translate(X, Y); if (!horiz) c.rotate(Math.PI / 2);
    c.fillStyle = 'rgba(20,14,8,.45)'; c.fillRect(-2.6, -7.5, 5.8, 15.5);
    c.fillStyle = '#7a5a36'; c.fillRect(-3, -8, 6, 16);
    c.fillStyle = '#9a7646'; for (let k = -7; k < 8; k += 2) c.fillRect(-3, k, 6, 1.1);
    c.fillStyle = '#4a3420'; c.fillRect(-3.4, -8, 0.8, 16); c.fillRect(2.6, -8, 0.8, 16);
    c.restore();
  }
}
// תעלות: קו זיגזג כהה ושקי חול בהירים מול האוגדה, לרוחב הכיוון אל האויב
function drawTrenches(c, vis) {
  const T = CFG.T;
  for (const d of S.divs) {
    if (!(d.dig > 0.15) || !d.digAt) continue;
    const X = (d.digAt[0] + 0.5) * T, Y = (d.digAt[1] + 0.5) * T; if (vis && (X < vis.x0 - 30 || X > vis.x1 + 30 || Y < vis.y0 - 30 || Y > vis.y1 + 30)) continue;
    const hd = d.digH || 0, fx = Math.cos(hd), fy = Math.sin(hd), px = -fy, py = fx, L = 6 + 12 * d.dig, cx = X + fx * 4, cy = Y + fy * 4;
    const pts = []; for (let k = 0, n = Math.round(L / 2.2); k <= n; k++) { const s = -L / 2 + L * k / n, z = (k % 2 ? 1 : -1) * 0.9; pts.push([cx + px * s + fx * z, cy + py * s + fy * z]); }
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(160,130,90,.85)'; c.lineWidth = 2.6; c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x + fx * 0.7, y + fy * 0.7) : c.moveTo(x + fx * 0.7, y + fy * 0.7)); c.stroke();
    c.strokeStyle = 'rgba(40,30,20,.9)'; c.lineWidth = 1.5; c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    if (d.dig > 0.6) { c.fillStyle = '#b8a070'; for (let k = 0; k < pts.length; k += 2) { const [x, y] = pts[k]; c.fillRect(x + fx * 1.6 - 0.8, y + fy * 1.6 - 0.5, 1.6, 1); } }
    c.restore();
  }
}
// תוויות: שמות תוואים (בזום בינוני ומעלה) ושמות נהרות
function featLabels(project) {
  const z = view.cam.zoom, T = CFG.T; if (z < 0.75) return;
  const strong = { pass: 1, strait: 1, bridge: 1, hill: 1 };
  for (const f of features()) {
    if (z < 1.1 && !strong[f.t]) continue;
    const [x, y] = XY(f.tile), wx = x * T + T / 2, wy = y * T + T / 2 + 7; if (!project(wx, wy)) continue;
    const o = S.owner[f.tile], col = o >= 0 ? S.nations[o].color : '#e8d8a0';
    drawLabel(wx, wy, featLabel(f), null, col);
  }
  // מרבצים אזוריים (economy.js)
  for (const d of S.deposits || []) { const D = DEPOSIT[d.k], [x, y] = XY(d.tile), wx = x * T + T / 2, wy = y * T + T / 2; if (!project(wx, wy)) continue; const o = S.owner[d.tile];
    drawLabel(wx, wy, `${D.ic} ${D.name}`, z >= 1.4 ? D.desc : null, o >= 0 ? S.nations[o].color : '#d8c890'); }
  if (S.rivers && z >= 0.6) for (const r of S.rivers) { const j = r.tiles[(r.tiles.length * 0.45) | 0], [x, y] = XY(j), wx = x * T + T / 2, wy = y * T + T / 2 - 6; if (!project(wx, wy)) continue; drawLabel(wx, wy, '〰 ' + r.name, null, '#8cc8ff'); }
}
