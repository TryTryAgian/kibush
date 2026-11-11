'use strict';
// אמנות מבנים ויחידות ברזולוציה גבוהה (8 פיקסלים ליחידת עולם).
// מבנים בתלת-ממד מדומה: גג + קיר חזיתי כהה + צל לדרום-מזרח — כדי שכל מבנה ייקרא לפי הצורה שלו.
// כל מבנה מקבל גם תג סמל קטן שמסביר מה הוא עושה (נעלם בזום קרוב מאוד, כשהציור עצמו ברור).
/* ---------- ART ---------- */
const APX = 8;
function bArt(key, size, fn) {
  if (BCACHE.has(key)) return BCACHE.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size * APX; const x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.scale(APX, APX); x.translate(size / 2, size / 2); x.lineJoin = 'round'; fn(x);
  c.wu = size; BCACHE.set(key, c); return c;
}
const shd = (hex, k) => { const [r, g, b] = hex2rgb(hex); const f = v => clamp(Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k), 0, 255); return `rgb(${f(r)},${f(g)},${f(b)})`; };
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// צל רך (מקבילית לדרום-מזרח)
function shadowBox(x, X, Y, w, d, hgt) {
  const o = hgt * 0.55 + 0.4; x.fillStyle = 'rgba(14,12,8,.38)';
  x.beginPath(); x.moveTo(X + w, Y - hgt); x.lineTo(X + w + o, Y - hgt + o); x.lineTo(X + w + o, Y + d + o); x.lineTo(X + o, Y + d + o); x.lineTo(X, Y + d); x.lineTo(X + w, Y + d); x.closePath(); x.fill();
}
// בניין: טביעת רגל X,Y,w,d (מבט על), גובה hgt — הגג מוסט למעלה וחזית הקיר נראית מתחתיו
function bldg(x, X, Y, w, d, hgt, wall, roof, kind = 'flat', o = {}) {
  shadowBox(x, X, Y, w, d, hgt);
  // קיר חזיתי
  x.fillStyle = shd(wall, 0.72); x.fillRect(X, Y + d - hgt, w, hgt);
  if (o.windows && hgt >= 1.2) { x.fillStyle = o.lit ? 'rgba(255,220,140,.75)' : 'rgba(30,34,40,.6)'; for (let k = 0.6; k < w - 0.6; k += 1.3) x.fillRect(X + k, Y + d - hgt + hgt * 0.35, 0.55, Math.min(0.7, hgt * 0.4)); }
  if (o.door) { x.fillStyle = 'rgba(28,24,18,.8)'; x.fillRect(X + w / 2 - 0.5, Y + d - Math.min(1.3, hgt), 1, Math.min(1.3, hgt)); }
  const RY = Y - hgt;   // הגג
  if (kind === 'gable') {   // גג רעפים: שני מדרונות ורכס
    const horiz = w >= d;
    if (horiz) { x.fillStyle = shd(roof, 1.12); x.fillRect(X, RY, w, d / 2); x.fillStyle = shd(roof, 0.82); x.fillRect(X, RY + d / 2, w, d / 2); x.fillStyle = shd(roof, 1.3); x.fillRect(X, RY + d / 2 - 0.12, w, 0.24); }
    else { x.fillStyle = shd(roof, 1.12); x.fillRect(X, RY, w / 2, d); x.fillStyle = shd(roof, 0.86); x.fillRect(X + w / 2, RY, w / 2, d); x.fillStyle = shd(roof, 1.3); x.fillRect(X + w / 2 - 0.12, RY, 0.24, d); }
    x.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0.5; k < (horiz ? w : d); k += 0.9) horiz ? x.fillRect(X + k, RY, 0.1, d) : x.fillRect(X, RY + k, w, 0.1);
  } else if (kind === 'saw') {   // גג משונן של מפעל
    const n = Math.max(3, Math.round(w / 1.6)), sw = w / n;
    for (let k = 0; k < n; k++) { x.fillStyle = shd(roof, 1.08); x.fillRect(X + k * sw, RY, sw * 0.62, d); x.fillStyle = '#9fb6c0'; x.fillRect(X + k * sw + sw * 0.62, RY, sw * 0.12, d); x.fillStyle = shd(roof, 0.7); x.fillRect(X + k * sw + sw * 0.74, RY, sw * 0.26, d); }
  } else if (kind === 'arch') {   // האנגר מקושת
    for (let k = 0; k < 6; k++) { x.fillStyle = shd(roof, 1.2 - k * 0.09); x.fillRect(X, RY + d * k / 6, w, d / 6 + 0.05); }
    x.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0.6; k < w; k += 1) x.fillRect(X + k, RY, 0.1, d);
  } else {   // גג שטוח עם מעקה
    x.fillStyle = roof; x.fillRect(X, RY, w, d);
    x.fillStyle = shd(roof, 0.78); x.fillRect(X, RY, w, 0.3); x.fillRect(X, RY, 0.3, d); x.fillRect(X + w - 0.3, RY, 0.3, d); x.fillRect(X, RY + d - 0.3, w, 0.3);
    x.fillStyle = shd(roof, 1.15); x.fillRect(X + 0.3, RY + 0.3, w - 0.6, 0.25);
    if (o.vents) { x.fillStyle = shd(roof, 0.65); for (const [vx, vy] of o.vents) x.fillRect(X + vx, RY + vy, 0.8, 0.8); }
  }
  x.strokeStyle = 'rgba(18,16,12,.55)'; x.lineWidth = 0.12; x.strokeRect(X, RY, w, d + hgt);
}
function ground(x, X, Y, w, d, col, edge) { x.fillStyle = 'rgba(14,12,8,.25)'; x.fillRect(X + 0.5, Y + 0.5, w, d); x.fillStyle = col; x.fillRect(X, Y, w, d); if (edge) { x.strokeStyle = edge; x.lineWidth = 0.18; x.strokeRect(X, Y, w, d); } }
function fence(x, X, Y, w, d) { x.strokeStyle = 'rgba(40,38,30,.85)'; x.lineWidth = 0.14; x.setLineDash([0.45, 0.3]); x.strokeRect(X, Y, w, d); x.setLineDash([]); }
function tree(x, X, Y, r, col = '#3c4a2c') { x.fillStyle = 'rgba(14,12,8,.35)'; x.beginPath(); x.arc(X + r * 0.5, Y + r * 0.5, r, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill(); x.fillStyle = shd(col, 1.25); x.beginPath(); x.arc(X - r * 0.3, Y - r * 0.3, r * 0.5, 0, 7); x.fill(); }
function flagPole(x, col, X, Y, h = 4.2) { x.fillStyle = 'rgba(14,12,8,.4)'; x.fillRect(X + 0.3, Y - 0.1, h * 0.5, 0.25); x.fillStyle = '#d8d4c8'; x.fillRect(X - 0.1, Y - h, 0.22, h); x.fillStyle = col; x.fillRect(X + 0.12, Y - h, 2.4, 1.5); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(X + 0.12, Y - h, 2.4, 0.3); x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(X + 1.3, Y - h, 0.15, 1.5); }

/* ---- מבנים ---- */
const CAMP_TINT = { inf: '#6e7454', cmdo: '#4f573c', light: '#73705c', heavy: '#686454', art: '#76704f', aa: '#64705e' };
function artCamp(nid, kind) {
  const col = S.nations[nid].color;
  return bArt(`camp2:${kind}:${nid}`, BSZ, x => {
    ground(x, -9.5, -7.5, 19, 15, '#6c6850'); fence(x, -9.5, -7.5, 19, 15);
    // מגרש מסדרים עם תורן דגל
    ground(x, 0.6, -6.6, 8, 6.8, '#9a8c68', 'rgba(60,54,40,.5)'); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(1.2, -6, 6.8, 0.2); x.fillRect(1.2, -0.6, 6.8, 0.2);
    // מגורים: שלושה צריפים ארוכים עם גג רעפים
    for (let k = 0; k < 3; k++) bldg(x, -8.6, -5.4 + k * 3.6, 7.4, 2, 1, '#8a8470', CAMP_TINT[kind] || '#6e7454', 'gable', { windows: true });
    const veh = CAMP_VEH[kind];
    if (veh) {   // רכבים חונים במגרש
      for (let k = 0; k < 3; k++) unitOn(x, veh, nid, 2.4 + k * 2.4, -3.2, -Math.PI / 2, kind === 'heavy' ? 2.8 : 2.4);
    } else {   // אוהלים
      for (let k = 0; k < 4; k++) { const tx = 1.6 + (k % 2) * 3.6, ty = -5.4 + (k >> 1) * 3; x.fillStyle = 'rgba(14,12,8,.35)'; x.fillRect(tx + 0.4, ty + 0.4, 2.4, 1.8); x.fillStyle = kind === 'cmdo' ? '#5e6448' : '#b4a882'; x.fillRect(tx, ty, 2.4, 1.8); x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(tx + 1.2, ty, 1.2, 1.8); x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(tx + 1.1, ty, 0.15, 1.8); }
    }
    bldg(x, 1, 2, 4, 2.6, 1.3, '#7a7464', '#5c5a52', 'flat', { door: true });            // מטה
    bldg(x, 5.8, 2.2, 2.8, 2.6, 1.6, '#6c6656', '#4e4c46', 'arch');                       // מחסן ציוד
    flagPole(x, col, 0.4, -0.4, 5);
    emblem(x, col, DIV_TYPES[kind]?.icon || 'inf', -8.4, 4.4);
  });
}
function artFactory(nid) {
  const col = S.nations[nid].color;
  return bArt(`factory2:${nid}`, BSZ, x => {
    ground(x, -9.5, -7.5, 19, 15, '#5c5a54'); fence(x, -9.5, -7.5, 19, 15);
    // מסילת פריקה לאורך החצר
    x.fillStyle = '#3e3a34'; x.fillRect(-9.5, 5.2, 19, 1.2); x.fillStyle = '#8a8070'; for (let k = -9.3; k < 9.5; k += 0.7) x.fillRect(k, 5.15, 0.2, 1.3); x.fillStyle = '#2a2622'; x.fillRect(-9.5, 5.4, 19, 0.15); x.fillRect(-9.5, 6.05, 19, 0.15);
    bldg(x, -8.6, -5.6, 11.5, 7.6, 2.2, '#7a5a46', '#8e8a80', 'saw', { windows: true });    // אולם ייצור
    bldg(x, 3.8, -5.6, 4.6, 3.6, 2.6, '#8a6a50', '#6e665c', 'flat', { windows: true, door: true, vents: [[1, 1], [2.6, 1.4]] });   // משרדים
    x.fillStyle = col; x.fillRect(3.8, -1.4 - 0.2, 4.6, 0.5);                                    // שלט בצבע האומה
    // ארובות לבנים גבוהות
    for (const cx of [4.6, 6.9]) { x.fillStyle = 'rgba(14,12,8,.4)'; x.fillRect(cx + 0.6, -0.6, 2.4, 0.8); x.fillStyle = '#7a4a38'; x.fillRect(cx, -4.2, 1.1, 4.2); x.fillStyle = '#5a3428'; x.fillRect(cx + 0.7, -4.2, 0.4, 4.2); x.fillStyle = '#2a2420'; x.fillRect(cx - 0.1, -4.5, 1.3, 0.5); for (let k = -3.6; k < 0; k += 1.1) { x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(cx, k, 1.1, 0.12); } }
    // ארגזים ומשטחים
    for (let k = 0; k < 6; k++) { const bx = -8.4 + (k % 3) * 1.5, by = 2.8 + (k / 3 | 0) * 1.2; x.fillStyle = 'rgba(14,12,8,.3)'; x.fillRect(bx + 0.25, by + 0.25, 1.2, 1); x.fillStyle = ['#8a6e48', '#5a6e6e', '#7a6a4a'][k % 3]; x.fillRect(bx, by, 1.2, 1); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(bx, by, 1.2, 0.2); }
    bldg(x, -3.4, 3, 5.4, 1.8, 1.1, '#5e5a52', '#4a4842', 'arch');                          // מחסן
    // מנוף גשר מעל המסילה
    x.strokeStyle = '#c8a040'; x.lineWidth = 0.3; x.beginPath(); x.moveTo(4.2, 4.6); x.lineTo(4.2, 6.8); x.moveTo(8, 4.6); x.lineTo(8, 6.8); x.moveTo(4, 4.6); x.lineTo(8.2, 4.6); x.stroke();
  });
}
function artUniversity(nid) {
  const col = S.nations[nid].color;
  return bArt(`university2:${nid}`, BSZ, x => {
    ground(x, -9.5, -7.5, 19, 15, '#5e6a3e');
    x.fillStyle = '#b0a27c'; x.fillRect(-0.7, -1, 1.4, 8.5); x.fillRect(-9.5, 4.2, 19, 1.1);   // שבילים
    x.fillStyle = '#c4b892'; x.beginPath(); x.arc(0, 4.7, 1.8, 0, 7); x.fill(); x.fillStyle = '#6a9aa8'; x.beginPath(); x.arc(0, 4.7, 0.9, 0, 7); x.fill();   // מזרקה
    // בניין ראשי בצורת ח עם גג רעפים אדום, עמודים וכיפה
    bldg(x, -8.4, -6.6, 16.8, 3.2, 1.8, '#d4c6a0', '#9a5a44', 'gable', { windows: true });
    bldg(x, -8.4, -3.6, 3.4, 6, 1.6, '#d4c6a0', '#9a5a44', 'gable', { windows: true });
    bldg(x, 5, -3.6, 3.4, 6, 1.6, '#d4c6a0', '#9a5a44', 'gable', { windows: true });
    x.fillStyle = '#ece4cc'; for (let k = -2.4; k <= 2.4; k += 0.8) x.fillRect(k - 0.12, -5.2, 0.24, 1.8);   // עמודי כניסה
    x.fillStyle = '#e8e0c8'; x.beginPath(); x.moveTo(-2.9, -5.3); x.lineTo(0, -6.9); x.lineTo(2.9, -5.3); x.closePath(); x.fill();   // גמלון
    x.fillStyle = 'rgba(14,12,8,.4)'; x.beginPath(); x.arc(0.6, -7, 2, 0, 7); x.fill();
    const g = x.createRadialGradient(-0.7, -8.2, 0.2, 0, -7.6, 2.1); g.addColorStop(0, '#d6e4e4'); g.addColorStop(1, '#5c8a8a'); x.fillStyle = g; x.beginPath(); x.arc(0, -7.6, 2, 0, 7); x.fill();   // כיפה
    x.fillStyle = '#e8d890'; x.fillRect(-0.15, -9.9, 0.3, 0.8);
    for (const [tx, ty] of [[-6, 1.4], [-3.6, 2.6], [3.6, 2.6], [6, 1.4], [-7.6, 6.4], [7.6, 6.4]]) tree(x, tx, ty, 1.1);
    flagPole(x, col, 8.6, 6.8, 3.6);
  });
}
function artFortress(nid) {
  const col = S.nations[nid].color;
  return bArt(`fortress2:${nid}`, BSZ, x => {
    const star = (rO, rI, dx = 0, dy = 0) => { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k & 1 ? rI : rO; x.lineTo(dx + Math.cos(a) * r, dy + Math.sin(a) * r); } x.closePath(); };
    star(9.6, 6.6, 0.9, 1.1); x.fillStyle = 'rgba(14,12,8,.4)'; x.fill();                     // צל
    star(9.6, 6.6); x.fillStyle = '#5a6a5a'; x.fill();                                         // חפיר
    star(8.6, 5.8, 0, 0.7); x.fillStyle = '#5a5240'; x.fill();                                // חזית החומה
    star(8.6, 5.8); const g = x.createLinearGradient(-8, -8, 8, 8); g.addColorStop(0, '#aaa088'); g.addColorStop(1, '#7a7260'); x.fillStyle = g; x.fill();   // ראש החומה
    x.strokeStyle = '#4a4434'; x.lineWidth = 0.25; x.stroke();
    star(6.4, 4.2); x.fillStyle = '#6e6650'; x.fill();                                        // חצר פנימית
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; unitOn(x, 'art', nid, Math.cos(a) * 7.2, Math.sin(a) * 7.2, a, 2); }   // תותחים בקרני הכוכב
    bldg(x, -2.4, -1.8, 4.8, 3.2, 1.6, '#7a7262', '#5e5848', 'flat', { door: true, vents: [[0.8, 0.8], [3.2, 0.8]] });   // בונקר מפקדה
    flagPole(x, col, 0, -2.3, 4.4);
  });
}
function artAirport(nid) {
  const col = S.nations[nid].color;
  return bArt(`airport2:${nid}`, 26, x => {
    ground(x, -12.5, -5, 25, 15, '#6a6c4c');
    x.fillStyle = 'rgba(14,12,8,.3)'; x.fillRect(-11.6, -3.4, 24, 4.4); x.fillStyle = '#3a3a38'; x.fillRect(-12, -3.8, 24, 4.4);   // מסלול
    x.fillStyle = '#e0e0d8'; x.fillRect(-11.6, -3.5, 23.2, 0.18); x.fillRect(-11.6, 0.3, 23.2, 0.18); for (let k = 0; k < 10; k++) x.fillRect(-10.6 + k * 2.3, -1.7, 1.3, 0.25);
    for (let k = 0; k < 4; k++) { x.fillRect(-11.5, -3.1 + k * 0.85, 1.2, 0.35); x.fillRect(10.3, -3.1 + k * 0.85, 1.2, 0.35); }   // סימוני סף
    x.fillStyle = '#4a4a46'; x.fillRect(-5, 0.6, 1.4, 3.2); x.fillRect(-5, 3.4, 15, 1.4);    // מסלול הסעה
    for (let k = 0; k < 2; k++) bldg(x, 1 + k * 4.6, 5.4, 4, 3.4, 1.6, '#7a7a72', '#9a9a92', 'arch');   // האנגרים
    bldg(x, -10.6, 4.6, 2.2, 2.2, 3.6, '#8a8270', '#5a5a52', 'flat');                          // מגדל פיקוח
    x.fillStyle = '#7ad8ff'; x.fillRect(-10.4, 1.2, 1.8, 0.6);
    x.fillStyle = '#f0a040'; x.beginPath(); x.moveTo(-6.4, 5.2); x.lineTo(-5, 4.8); x.lineTo(-5, 5.6); x.fill();   // שרוול רוח
    unitOn(x, 'plane', nid, -1.8, 7.4, -Math.PI / 2, 4); unitOn(x, 'plane', nid, 6, -1.6, 0, 3.6);
    x.fillStyle = col; x.fillRect(1, 5.4 - 1.6, 8.6, 0.35);
    flagPole(x, col, -6.8, 8.6, 3.6);
  });
}
function artPort(nid) {
  const col = S.nations[nid].color;
  return bArt(`port2:${nid}`, BSZ, x => {
    ground(x, -9.5, -7.5, 10.6, 15, '#6e6a60');
    x.fillStyle = '#9a948a'; x.fillRect(0.4, -7.5, 0.8, 15); x.fillStyle = '#3e3a34'; x.fillRect(1.2, -7.5, 0.25, 15);   // שפת הרציף
    bldg(x, -8.8, -6.6, 5.6, 3.6, 1.6, '#8a6a4c', '#7a5a40', 'gable', { windows: true });  // מחסנים
    bldg(x, -8.8, -1.6, 5.6, 3.6, 1.6, '#8a6a4c', '#6a6a62', 'arch');
    x.fillStyle = col; x.fillRect(-8.8, -6.6 - 1.6, 5.6, 0.4);
    for (const Y of [-5.2, 3.2]) { x.fillStyle = 'rgba(14,12,8,.3)'; x.fillRect(1.6, Y + 0.3, 7.4, 1.2); x.fillStyle = '#806c4c'; x.fillRect(1.4, Y, 7.4, 1.2); x.fillStyle = 'rgba(30,24,16,.4)'; for (let k = 0; k < 7; k++) x.fillRect(1.6 + k, Y, 0.15, 1.2); }   // מזחים
    for (let k = 0; k < 6; k++) { const cx = -2.6 + (k % 3) * 1.1, cy = 3.6 + (k / 3 | 0) * 1.6; x.fillStyle = 'rgba(14,12,8,.35)'; x.fillRect(cx + 0.2, cy + 0.2, 1, 1.4); x.fillStyle = ['#a04a3a', '#3a6a7a', '#b08a3a', '#5a7a4a', '#7a4a6a', '#4a5a8a'][k]; x.fillRect(cx, cy, 1, 1.4); x.fillStyle = 'rgba(0,0,0,.2)'; for (let j = 0.2; j < 1.4; j += 0.3) x.fillRect(cx, cy + j, 1, 0.08); }   // מכולות
    // עגורן מכולות
    x.fillStyle = 'rgba(14,12,8,.35)'; x.fillRect(-0.4, 0.4, 5, 0.6);
    x.strokeStyle = '#d8a838'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(-1, -1.2); x.lineTo(-1, 2.6); x.moveTo(0.4, -1.2); x.lineTo(0.4, 2.6); x.moveTo(-1.6, -1.2); x.lineTo(4.6, -1.2); x.stroke();
    x.fillStyle = '#d8a838'; x.fillRect(2.8, -1.5, 0.8, 0.6); x.strokeStyle = '#2a2a28'; x.lineWidth = 0.1; x.beginPath(); x.moveTo(3.2, -0.9); x.lineTo(3.2, 0.4); x.stroke();
    x.save(); x.translate(5, -1.8); drawShipShape(x, col, 0, 6.5, true); x.restore();
    flagPole(x, col, -9, 7, 3.6);
  });
}
// תג סמל: מה המבנה עושה. גודל קבוע על המסך; נעלם בזום קרוב מאוד
const B_ICON = { camp: '⛺', factory: '🏭', university: '🎓', fortress: '🏰', airport: '✈', port: '⚓' };
function drawBadge(b, cx, cy, s) {
  const z = view.cam.zoom; if (z > 3.2 || z < 0.35) return;
  const k = clamp(2.2 / z, 0.5, 4), r = 3.2 * k, bx = cx - s / 2 + r * 0.6, by = cy - s / 2 + r * 0.6;
  ctx.fillStyle = 'rgba(12,16,24,.85)'; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
  ctx.strokeStyle = S.nations[b.n].color; ctx.lineWidth = 0.7 * k; ctx.stroke();
  ctx.font = `${(3.6 * k).toFixed(2)}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(B_ICON[b.type] || '•', bx, by + 0.2 * k);
}

/* ---- עיר ---- */
const ROOF2 = ['#a85a44', '#b46a4c', '#9a5040', '#8a6450', '#b88a5c', '#7a5a4c', '#a87858', '#c49a6a'];
const WALL2 = ['#d4c6a4', '#c8b896', '#e0d4b4', '#bcae8c', '#d8cca8'];
function townArt(i, b) {
  const key = 'v2:' + i + ':' + (b.lvl || 1) + ':' + (b.capital ? 1 : 0);
  if (TOWNC.has(key)) return TOWNC.get(key);
  const rad = townRad(b), size = Math.ceil(rad * 2 + 8), lvl = b.lvl || 1, P = APX;
  const c = document.createElement('canvas'); c.width = c.height = size * P; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.scale(P, P); x.translate(size / 2, size / 2);
  // רחובות: טבעת ורחובות יוצאים
  const ns = 3 + lvl, angs = Array.from({ length: ns }, (_, k) => hash01(i, k, 21) * 6.283);
  x.strokeStyle = 'rgba(120,112,96,.85)'; x.lineWidth = 1.1; x.lineCap = 'round'; x.beginPath();
  for (const a of angs) { x.moveTo(0, 0); x.lineTo(Math.cos(a) * rad * 1.1, Math.sin(a) * rad * 0.9); }
  x.ellipse(0, 0, rad * 0.55, rad * 0.46, 0, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(190,180,160,.35)'; x.lineWidth = 0.25; x.stroke();
  // בתים: מבנים קטנים עם גג רעפים, מסודרים בשורות לאורך הרחובות
  const n = Math.round((6 + lvl * 6 + (b.capital ? 8 : 0)) * 1.7), houses = [];
  for (let k = 0; k < n; k++) {
    const a = angs[k % ns] + (hash01(i, k, 11) - 0.5) * 0.9, r = (0.15 + 0.75 * Math.sqrt(hash01(k, i, 12))) * rad, side = hash01(k, i, 16) < 0.5 ? -1 : 1;
    const hx = Math.cos(a) * r + Math.cos(a + 1.57) * side * 1.9, hy = (Math.sin(a) * r + Math.sin(a + 1.57) * side * 1.9) * 0.84;
    const big = r < rad * 0.35, w = (big ? 3.2 : 2.3) + (hash01(i + k, 3, 13) * 3 | 0) * 0.6, d = (big ? 2.6 : 2) + (hash01(k, i + 3, 14) * 2 | 0) * 0.5;
    houses.push([hx - w / 2, hy - d / 2, w, d, big ? 1.2 + lvl * 0.25 : 0.7 + hash01(k, 5, 17) * 0.4, ROOF2[(hash01(i, k, 15) * ROOF2.length) | 0], WALL2[(hash01(k, i, 18) * WALL2.length) | 0]]);
  }
  houses.sort((p, q) => p[1] - q[1]);   // מרחוק לקרוב — חפיפה נכונה
  // עצים בין הבתים
  for (let k = 0; k < 6 + lvl * 2; k++) { const a = hash01(i, k, 41) * 6.283, r = (0.4 + 0.7 * hash01(k, i, 42)) * rad; tree(x, Math.cos(a) * r, Math.sin(a) * r * 0.84, 0.7 + hash01(k, k, 43) * 0.5); }
  for (const [hx, hy, w, d, hg, roof, wall] of houses) bldg(x, hx, hy, w, d, hg, wall, roof, 'gable', { windows: w > 2 });
  if (b.capital) {   // כיכר וארמון עם כיפה
    x.fillStyle = 'rgba(14,12,8,.3)'; x.fillRect(-4.2, -3.2, 9, 8); x.fillStyle = '#c4baa0'; x.fillRect(-4.6, -3.8, 9.2, 8);
    x.fillStyle = 'rgba(255,255,255,.15)'; for (let k = -4.2; k < 4.6; k += 1) x.fillRect(k, -3.8, 0.1, 8);
    bldg(x, -3.4, -3.2, 6.8, 4.2, 2.2, '#e4dcc4', '#6a7a8a', 'flat', { windows: true, door: true });
    const g = x.createRadialGradient(-0.6, -6.6, 0.2, 0, -6, 1.9); g.addColorStop(0, '#f0e0a0'); g.addColorStop(1, '#a88a3a'); x.fillStyle = g; x.beginPath(); x.arc(0, -6, 1.8, 0, 7); x.fill();
    flagPole(x, S.nations[b.n].color, 2.9, -5.2, 3.6);
  }
  c.wu = size; TOWNC.set(key, c); return c;
}

/* ---- יחידות: ספרייטים פרוצדורליים במבט-על, פונים ל-+x ---- */
const UCACHE = new Map(), UPX = 12;
const UNIT_DEF = { inf: 1, cmdo: 1, ltank: 1, htank: 1, art: 1, aa: 1, truck: 1 };
function unitCanvas(t, nid, fr) {
  const key = t + ':' + nid + ':' + fr; if (UCACHE.has(key)) return UCACHE.get(key);
  const S0 = 8, c = document.createElement('canvas'); c.width = c.height = S0 * UPX; const x = c.getContext('2d');
  x.scale(UPX, UPX); x.translate(S0 / 2, S0 / 2); x.lineCap = 'round'; x.lineJoin = 'round';
  const nc = S.nations[nid].color, uni = mix(nc, '#5a6040', 0.45), dk = shd(uni, 0.6), lt = shd(uni, 1.25), metal = '#2e302c';
  const shadow = (fn) => { x.save(); x.translate(0.45, 0.45); x.globalAlpha = 0.35; x.fillStyle = '#0e0c08'; x.strokeStyle = '#0e0c08'; fn(true); x.restore(); };
  const tracks = (L, Wd) => { x.fillStyle = metal; x.fillRect(-L / 2, -Wd / 2, L, 0.7); x.fillRect(-L / 2, Wd / 2 - 0.7, L, 0.7); x.fillStyle = '#5a5a52'; for (let k = -L / 2 + (fr ? 0.3 : 0); k < L / 2; k += 0.6) { x.fillRect(k, -Wd / 2, 0.15, 0.7); x.fillRect(k, Wd / 2 - 0.7, 0.15, 0.7); } };
  if (t === 'ltank' || t === 'htank') {
    const H_ = t === 'htank', L = H_ ? 6 : 5, Wd = H_ ? 3.8 : 3.2, tr = H_ ? 1.25 : 0.95, bl = H_ ? 3.6 : 2.8;
    shadow(() => { x.fillRect(-L / 2, -Wd / 2, L, Wd); });
    tracks(L, Wd);
    x.fillStyle = uni; x.fillRect(-L / 2 + 0.3, -Wd / 2 + 0.6, L - 0.6, Wd - 1.2);
    x.fillStyle = lt; x.fillRect(-L / 2 + 0.3, -Wd / 2 + 0.6, L - 0.6, 0.35); x.fillStyle = dk; x.fillRect(-L / 2 + 0.3, Wd / 2 - 0.95, L - 0.6, 0.35);
    x.fillStyle = dk; x.fillRect(-L / 2 + 0.4, -0.5, 0.6, 1);   // מנוע
    x.strokeStyle = metal; x.lineWidth = H_ ? 0.45 : 0.35; x.beginPath(); x.moveTo(0.2, 0); x.lineTo(0.2 + bl, 0); x.stroke();   // קנה
    x.fillStyle = metal; x.fillRect(0.2 + bl - 0.3, -0.3, 0.45, 0.6);
    x.fillStyle = dk; x.beginPath(); x.arc(0.2, 0.15, tr, 0, 7); x.fill(); x.fillStyle = uni; x.beginPath(); x.arc(0.1, 0, tr, 0, 7); x.fill();   // צריח
    x.fillStyle = lt; x.beginPath(); x.arc(-0.2, -0.3, tr * 0.45, 0, 7); x.fill();
    x.fillStyle = nc; x.fillRect(-L / 2 + 0.6, -0.25, 0.5, 0.5);   // סימון לאום
  } else if (t === 'inf' || t === 'cmdo') {
    const step = fr ? 0.35 : -0.35, helm = t === 'cmdo' ? mix(nc, '#2a2e22', 0.6) : shd(uni, 0.75);
    shadow(() => { x.beginPath(); x.ellipse(0, 0, 1.1, 1.6, 0, 0, 7); x.fill(); });
    x.fillStyle = shd(uni, 0.55); x.fillRect(-0.4 + step, -0.75, 1.1, 0.5); x.fillRect(-0.4 - step, 0.25, 1.1, 0.5);   // רגליים
    x.fillStyle = shd(uni, 0.7); x.beginPath(); x.ellipse(-0.75, 0, 0.6, 0.9, 0, 0, 7); x.fill();   // תרמיל
    x.fillStyle = uni; x.beginPath(); x.ellipse(0, 0, 0.75, 1.45, 0, 0, 7); x.fill();                   // כתפיים
    x.strokeStyle = '#3a2e22'; x.lineWidth = 0.28; x.beginPath(); x.moveTo(0.1, 0.9); x.lineTo(2.1, 0.55); x.stroke();   // רובה
    x.fillStyle = shd(uni, 1.1); x.beginPath(); x.arc(0.6, 0.85, 0.32, 0, 7); x.fill();               // ידיים
    x.fillStyle = helm; x.beginPath(); x.arc(0.05, 0, 0.72, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.arc(-0.15, -0.2, 0.3, 0, 7); x.fill();   // קסדה
  } else if (t === 'art') {
    shadow(() => { x.beginPath(); x.moveTo(-3, -1.4); x.lineTo(1, -1); x.lineTo(1, 1); x.lineTo(-3, 1.4); x.fill(); });
    x.strokeStyle = shd(uni, 0.7); x.lineWidth = 0.4; x.beginPath(); x.moveTo(0, -0.5); x.lineTo(-3, -1.4); x.moveTo(0, 0.5); x.lineTo(-3, 1.4); x.stroke();   // רגלי גרירה
    x.fillStyle = metal; x.fillRect(-0.6, -1.7, 1.2, 0.55); x.fillRect(-0.6, 1.15, 1.2, 0.55);   // גלגלים
    x.fillStyle = uni; x.fillRect(-0.4, -1.15, 1, 2.3); x.fillStyle = lt; x.fillRect(-0.4, -1.15, 1, 0.3);   // מגן
    x.strokeStyle = metal; x.lineWidth = 0.45; x.beginPath(); x.moveTo(0, 0); x.lineTo(3.4, 0); x.stroke();   // קנה
    x.fillStyle = metal; x.fillRect(3.1, -0.3, 0.5, 0.6);
  } else if (t === 'aa') {
    shadow(() => x.fillRect(-2.6, -1.4, 5, 2.8));
    x.fillStyle = metal; for (const X of [-2, -0.6, 1.2]) { x.fillRect(X, -1.55, 0.8, 0.4); x.fillRect(X, 1.15, 0.8, 0.4); }
    x.fillStyle = uni; x.fillRect(-2.6, -1.2, 5, 2.4); x.fillStyle = lt; x.fillRect(-2.6, -1.2, 5, 0.3);
    x.fillStyle = dk; x.fillRect(1.3, -1.1, 1.1, 2.2);   // תא נהג
    x.fillStyle = shd(uni, 0.85); x.beginPath(); x.arc(-0.7, 0, 0.9, 0, 7); x.fill();
    x.strokeStyle = metal; x.lineWidth = 0.22; x.beginPath(); for (const o of [-0.45, -0.15, 0.15, 0.45]) { x.moveTo(-0.7, o); x.lineTo(1.6, o * 1.6 - 0.6); } x.stroke();   // ארבעה קנים
  } else if (t === 'truck') {
    shadow(() => x.fillRect(-2.6, -1.2, 5.2, 2.4));
    x.fillStyle = metal; for (const X of [-2, -0.6, 1.4]) { x.fillRect(X, -1.35, 0.7, 0.3); x.fillRect(X, 1.05, 0.7, 0.3); }
    x.fillStyle = shd(uni, 0.9); x.fillRect(-2.6, -1.05, 3.6, 2.1); x.fillStyle = 'rgba(0,0,0,.2)'; for (let k = -2.2; k < 1; k += 0.7) x.fillRect(k, -1.05, 0.12, 2.1);   // ברזנט
    x.fillStyle = dk; x.fillRect(1.2, -0.95, 1.4, 1.9); x.fillStyle = '#9ac0d0'; x.fillRect(2.1, -0.75, 0.35, 1.5);   // תא נהג
  }
  UCACHE.set(key, c); return c;
}
// ציור יחידה בקנבס של מבנה (מבט-על)
function unitOn(x, t, nid, X, Y, ang, s) {
  if (UNIT_DEF[t]) { const c = unitCanvas(t, nid, 0); x.save(); x.translate(X, Y); x.rotate(ang); x.drawImage(c, -s * 0.8, -s * 0.8, s * 1.6, s * 1.6); x.restore(); }
  else parked(x, t, nid, X, Y, ang, s);
}
// דורס את tdSprite של render.js: יחידות בשטח — פרוצדורליות וחדות
function tdSprite(t, nid, x, y, ang, s, anim) {
  if (UNIT_DEF[t]) {
    const c = unitCanvas(t, nid, anim ? ((view.anim | 0) % 2) : 0), k = s * 1.6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(c, -k / 2, -k / 2, k, k); ctx.restore(); return;
  }
  const key = t === 'plane' ? 'plane' : 'td_' + t, A = ATLAS[key]; if (!A) return;
  const c = sprite(key, nid, anim && A[3] > 1 ? (view.anim | 0) % A[3] : 0), kk = c.width / A[2];
  ctx.save(); ctx.translate(x, y); ctx.rotate(t === 'plane' ? ang + Math.PI / 2 : ang); ctx.drawImage(c, -s / 2, -s / 2, s * kk, s * kk); ctx.restore();
}
