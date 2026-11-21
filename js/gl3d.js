'use strict';
// ===================== תצוגת תלת-ממד (WebGL2) =====================
// מזום מסוים המצלמה נוטה בהדרגה (מצלמה אורתוגרפית בזווית) והעולם מצויר בתלת-ממד:
// שטח עם גבהים אמיתיים (מכוסה בתמונת המפה הדו-ממדית), מבנים, ערים, עצים ויחידות מקוביות, שמש עם צללים, לילה עם חלונות דולקים.
// על הקנבס הדו-ממדי שמעל מצוירות רק שכבות-על: תוויות, סמלי גנרלים, חיצים, אפקטים.
// מיפוי המסך (CSS px): sx = (x-cx)*z + W/2 ; sy = (y-cy)*z*cos - h*z*sin + H/2
/* ---------- GL3D ---------- */
const G3 = { on: false, th: 0, cos: 1, sin: 0, gl: null, ok: null, fp: null, gTex: null, gCv: null, gCtx: null, gT: 0, mesh: null, models: new Map(), towns: new Map(), trees: null, shadow: null };
const glCv = document.createElement('canvas'); glCv.id = 'gl';
glCv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:none;z-index:0';
document.body.insertBefore(glCv, document.getElementById('cv'));

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function g3Update() {
  const want = (typeof PREFS === 'undefined' || PREFS.g3 !== false) && S && !S.demo;
  const th = want ? smooth(CFG.TILT_Z0, CFG.TILT_Z1, view.cam.zoom) * CFG.TILT_MAX * Math.PI / 180 : 0;
  G3.th = th; G3.cos = Math.cos(th); G3.sin = Math.sin(th);
  const on = th > 0.004 && g3Init();
  if (on !== G3.on) { G3.on = on; glCv.style.display = on ? 'block' : 'none'; G3.fp = null; }
  return G3.on;
}
const g3C = () => { const c = view.cam; return [c.x + innerWidth / 2 / c.zoom, c.y + innerHeight / 2 / c.zoom]; };
// גובה השטח (יחידות עולם) בנקודת עולם
function g3H(wx, wy) {
  if (!TERR.hg) return 0; const T = CFG.T, u = clamp(wx / T, 0, W - 1.001), v = clamp(wy / T, 0, H - 1.001), x = u | 0, y = v | 0, fx = u - x, fy = v - y, A = TERR.hg, CW = TERR.CW, k = y * CW + x;
  const e = (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fy) + (A[k + CW] * (1 - fx) + A[k + CW + 1] * fx) * fy;
  const m = Math.max(0, e - 2.4); return (Math.max(0, e - 0.35) + 0.38 * m * Math.sqrt(m) * Math.sqrt(Math.sqrt(m))) * CFG.H3;   // הרים: גובה מוגזם (לא ליניארי) — הרכסים מתנשאים מעל הגבעות
}
function g3P(wx, wy, h) { const z = view.cam.zoom, [cx, cy] = g3C(); return [(wx - cx) * z + innerWidth / 2, (wy - cy) * z * G3.cos - (h ?? g3H(wx, wy)) * z * G3.sin + innerHeight / 2]; }
function g3Inv(sx, sy) {
  const z = view.cam.zoom, [cx, cy] = g3C(), wx = cx + (sx - innerWidth / 2) / z; let wy = cy + (sy - innerHeight / 2) / z / G3.cos;
  for (let k = 0; k < 3; k++) wy = cy + ((sy - innerHeight / 2) / z + g3H(wx, wy) * G3.sin) / G3.cos;
  return [wx, wy];
}

/* ---- WebGL: הקשר, שיידרים ---- */
const VS_LIT = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol;
layout(location=3) in vec4 iA; layout(location=4) in vec4 iB;   // מופע: x,y,h,זווית | קנה מידה, צבע אומה
uniform mat4 uVP, uLVP; uniform vec4 uM; uniform float uInst; uniform vec2 uUV0, uUVS;
out vec3 vNor; out vec4 vCol; out vec4 vL; out vec2 vUV; out float vH; out vec3 vW;
void main(){
  vec4 A = uInst > 0.5 ? iA : vec4(uM.xyz, uM.w); float s = uInst > 0.5 ? iB.x : 1.0;
  float c = cos(A.w), si = sin(A.w);
  vec3 p = vec3(aPos.x*c - aPos.y*si, aPos.x*si + aPos.y*c, aPos.z) * s + A.xyz;
  vNor = vec3(aNor.x*c - aNor.y*si, aNor.x*si + aNor.y*c, aNor.z);
  vCol = aCol; if (aCol.a > 1.5 && aCol.a < 2.5) vCol = vec4(aCol.rgb * (uInst > 0.5 ? iB.yzw : vec3(1.0)), 0.0);
  vL = uLVP * vec4(p, 1.0); vUV = (p.xy - uUV0) / uUVS; vH = p.z; vW = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS_LIT = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vNor; in vec4 vCol; in vec4 vL; in vec2 vUV; in float vH; in vec3 vW;
uniform vec4 uPL[24]; uniform vec3 uPLC[24]; uniform int uNPL; uniform float uEmit;
uniform sampler2D uFarm; uniform float uT, uFS; uniform int uSeed;
float h01(int x, int y, int s){ uint h = uint(x)*374761393u + uint(y)*668265263u + uint(s)*1442695041u; h = (h ^ (h >> 13u)) * 1274126177u; h ^= (h >> 16u); return float(h) / 4294967296.0; }
uniform vec3 uSun, uSunCol, uAmb; uniform sampler2DShadow uSh; uniform sampler2D uTex; uniform float uGround, uNight, uShOn, uTime;
out vec4 o;
float shade(){
  if (uShOn < 0.5) return 1.0;
  vec3 q = vL.xyz / vL.w * 0.5 + 0.5; if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return 1.0;
  float b = 0.0015, s = 0.0; vec2 t = vec2(1.0/2048.0);
  for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) s += texture(uSh, vec3(q.xy + vec2(i,j)*t, q.z - b));
  return s / 9.0;
}
void main(){
  vec3 n = normalize(vNor); vec3 base = uGround > 0.5 ? texture(uTex, vUV).rgb : vCol.rgb;
  // שדות: תלמים בתבליט (אותה חלוקה לשדות כמו בתמונת הקרקע) — האור והצל של השמש נופלים עליהם
  if (uGround > 0.5 && texelFetch(uFarm, ivec2(floor(vW.xy / uT)), 0).r > 0.5) {
    float wx = vW.x, wy = vW.y; int cx = int(floor(wx / uFS)), cy = int(floor(wy / uFS)); bool sx = h01(cx, cy, uSeed + 61) < 0.5;
    int fx = sx ? int(floor(wx / (uFS * 2.0))) : cx, fy = sx ? cy : int(floor(wy / (uFS * 2.0)));
    float lx = wx - (sx ? float(fx) * uFS * 2.0 : float(fx) * uFS), ly = wy - (sx ? float(fy) * uFS : float(fy) * uFS * 2.0);
    if (h01(fx, fy, uSeed + 62 + (sx ? 1 : 0)) >= 0.12 && lx > 0.35 && ly > 0.35) {
      bool ax = h01(fx, fy, uSeed + 63) < 0.5; float q = (ax ? lx : ly) * 6.2832 / 1.5;
      n = normalize(n + (ax ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)) * cos(q) * 0.55);
      base *= 0.92 + 0.08 * sin(q);
    }
  }
  float em = uGround > 0.5 ? 0.0 : vCol.a;
  float d = max(dot(n, uSun), 0.0) * shade();
  vec3 c = base * (uAmb + uSunCol * d);
  // אורות נקודתיים: ערים בלילה, פנסים ופיצוצים
  for (int i = 0; i < 24; i++) { if (i >= uNPL) break; vec3 L = uPL[i].xyz - vW; float dd = length(L); float a = max(0.0, 1.0 - dd / uPL[i].w); a *= a; c += base * uPLC[i] * a * (0.45 + 0.55 * max(dot(n, L / max(dd, 0.001)), 0.0)); }
  if (uGround > 0.5 && vH < 0.05) { float w = sin(vUV.x*900.0 + uTime*1.3) * sin(vUV.y*700.0 - uTime) * 0.04; c += vec3(w*0.6, w*0.8, w); }   // נצנוץ מים
  if (em > 0.5) c = mix(c, vCol.rgb * 1.6, max(uNight, uEmit));   // חלונות ופנסים דולקים בלילה
  o = vec4(c, 1.0);
}`;
const VS_SH = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=3) in vec4 iA; layout(location=4) in vec4 iB;
uniform mat4 uLVP; uniform vec4 uM; uniform float uInst;
void main(){ vec4 A = uInst > 0.5 ? iA : uM; float s = uInst > 0.5 ? iB.x : 1.0; float c = cos(A.w), si = sin(A.w);
  vec3 p = vec3(aPos.x*c - aPos.y*si, aPos.x*si + aPos.y*c, aPos.z) * s + A.xyz; gl_Position = uLVP * vec4(p, 1.0); }`;
const FS_SH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.0); }`;
const VS_P = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in float aSize; layout(location=2) in vec4 aCol;
uniform mat4 uVP; uniform float uPx; out vec4 vC;
void main(){ gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = max(1.0, aSize * uPx); vC = aCol; }`;
const FS_P = `#version 300 es
precision mediump float; in vec4 vC; uniform float uLine; out vec4 o;
void main(){ if (uLine > 0.5) { o = vC; return; } vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard; float a = vC.a * (1.0 - d) * (1.0 - d * 0.3); o = vec4(vC.rgb, a); }`;
function g3Init() {
  if (G3.ok != null) return G3.ok;
  const gl = glCv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { G3.ok = false; return false; }
  const prog = (vs, fs) => { const p = gl.createProgram(); for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); } gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; };
  try {
    G3.lit = prog(VS_LIT, FS_LIT); G3.sh = prog(VS_SH, FS_SH); G3.pp = prog(VS_P, FS_P);
    G3.pVao = gl.createVertexArray(); G3.pBuf = gl.createBuffer(); gl.bindVertexArray(G3.pVao); gl.bindBuffer(gl.ARRAY_BUFFER, G3.pBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.bindVertexArray(null);
    // מפת צללים
    const SZ = 2048, dt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, dt);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SZ, SZ);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dt, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    G3.shadow = { tex: dt, fb, SZ };
    G3.gTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G3.gTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    G3.farmTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G3.farmTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    G3.instBuf = gl.createBuffer(); G3.gl = gl; G3.ok = true;
  } catch (e) { console.error('WebGL', e); G3.ok = false; }
  return G3.ok;
}

/* ---- בניית גיאומטריה: קוביות, גגות משופעים, גלילים ---- */
class Mesh {
  constructor() { this.v = []; }   // x,y,z, nx,ny,nz, r,g,b,a
  quad(p, n, c) { const [a, b, cc, d] = p; for (const q of [a, b, cc, a, cc, d]) this.v.push(q[0], q[1], q[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3] ?? 0); }
  tri(p, n, c) { for (const q of p) this.v.push(q[0], q[1], q[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3] ?? 0); }
  // קובייה מ-(x0,y0,z0) עד (x1,y1,z1). y של העולם = דרום, z = למעלה
  box(x0, y0, z0, x1, y1, z1, c, top) {
    const t = top || c;
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], t);
    this.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], c);
    this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]], [0, -1, 0], c);
    this.quad([[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]], [1, 0, 0], c);
    this.quad([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], c);
    return this;
  }
  // גג רעפים: רכס לאורך הציר הארוך
  gable(x0, y0, x1, y1, z0, z1, c) {
    const hz = (x1 - x0) >= (y1 - y0), L = 0.85, D = 1.15;
    if (hz) { const ym = (y0 + y1) / 2, ny = (z1 - z0), nn = Math.hypot(ny, (y1 - y0) / 2);
      this.quad([[x0, y0, z0], [x1, y0, z0], [x1, ym, z1], [x0, ym, z1]], [0, -(z1 - z0) / nn, ((y1 - y0) / 2) / nn], c.map((v, i) => i < 3 ? v * D : v));
      this.quad([[x1, y1, z0], [x0, y1, z0], [x0, ym, z1], [x1, ym, z1]], [0, (z1 - z0) / nn, ((y1 - y0) / 2) / nn], c.map((v, i) => i < 3 ? v * L : v));
      this.tri([[x0, y1, z0], [x0, y0, z0], [x0, ym, z1]], [-1, 0, 0], c.map((v, i) => i < 3 ? v * 0.8 : v)); this.tri([[x1, y0, z0], [x1, y1, z0], [x1, ym, z1]], [1, 0, 0], c.map((v, i) => i < 3 ? v * 0.8 : v)); }
    else { const xm = (x0 + x1) / 2, nn = Math.hypot(z1 - z0, (x1 - x0) / 2);
      this.quad([[x0, y1, z0], [x0, y0, z0], [xm, y0, z1], [xm, y1, z1]], [-(z1 - z0) / nn, 0, ((x1 - x0) / 2) / nn], c.map((v, i) => i < 3 ? v * D : v));
      this.quad([[x1, y0, z0], [x1, y1, z0], [xm, y1, z1], [xm, y0, z1]], [(z1 - z0) / nn, 0, ((x1 - x0) / 2) / nn], c.map((v, i) => i < 3 ? v * L : v));
      this.tri([[x0, y0, z0], [x1, y0, z0], [xm, y0, z1]], [0, -1, 0], c.map((v, i) => i < 3 ? v * 0.8 : v)); this.tri([[x1, y1, z0], [x0, y1, z0], [xm, y1, z1]], [0, 1, 0], c.map((v, i) => i < 3 ? v * 0.8 : v)); }
    return this;
  }
  // גליל משושה (צריח, ארובה, גזע)
  cyl(cx, cy, r, z0, z1, c, n = 6, top) {
    for (let k = 0; k < n; k++) { const a0 = k / n * 6.283, a1 = (k + 1) / n * 6.283, am = (a0 + a1) / 2;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
      this.quad([[p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]], [Math.cos(am), Math.sin(am), 0], c);
      this.tri([[cx, cy, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1]], [0, 0, 1], top || c); }
    return this;
  }
  // כיפה / צמרת עץ: חרוט משושה
  cone(cx, cy, r, z0, z1, c, n = 6) {
    for (let k = 0; k < n; k++) { const a0 = k / n * 6.283, a1 = (k + 1) / n * 6.283, am = (a0 + a1) / 2, s = r / (z1 - z0), nl = Math.hypot(1, s);
      this.tri([[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0], [cx, cy, z1]], [Math.cos(am) / nl, Math.sin(am) / nl, s / nl], c.map((v, i) => i < 3 ? v * (0.85 + 0.25 * Math.max(0, -Math.cos(am - 2.4))) : v)); }
    return this;
  }
  upload() {
    const gl = G3.gl, a = new Float32Array(this.v), vao = gl.createVertexArray(), b = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
    gl.bindBuffer(gl.ARRAY_BUFFER, G3.instBuf);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    return { vao, buf: b, n: a.length / 10 };
  }
}
const rgb = (hex, a = 0) => { const [r, g, b] = hex2rgb(hex); return [r / 255, g / 255, b / 255, a]; };
const TEAM = [1, 1, 1, 2];   // צבע שמוחלף בצבע האומה (במופעים)
const LIT = [1, 0.85, 0.55, 1];   // חלון: נדלק בלילה

/* ---- מודלים של מבנים ---- */
function windowsOn(m, x0, x1, y, z0, z1, side) {   // שורת חלונות על חזית (side: 1 = דרום)
  const off = side > 0 ? 0.04 : -0.04;
  for (let x = x0 + 0.7; x < x1 - 0.5; x += 1.4) { const yy = y + off; m.quad(side > 0 ? [[x, yy, z0], [x + 0.6, yy, z0], [x + 0.6, yy, z1], [x, yy, z1]] : [[x + 0.6, yy, z0], [x, yy, z0], [x, yy, z1], [x + 0.6, yy, z1]], [0, side, 0], [0.16, 0.18, 0.22, 0]); m.quad(side > 0 ? [[x + 0.05, yy + off, z0 + 0.05], [x + 0.55, yy + off, z0 + 0.05], [x + 0.55, yy + off, z1 - 0.05], [x + 0.05, yy + off, z1 - 0.05]] : [[x + 0.55, yy + off, z0 + 0.05], [x + 0.05, yy + off, z0 + 0.05], [x + 0.05, yy + off, z1 - 0.05], [x + 0.55, yy + off, z1 - 0.05]], [0, side, 0], LIT); }
}
// בניין: קירות + גג (gable/flat) + חלונות לחזית הדרומית והצפונית
function house(m, x0, y0, x1, y1, h, wall, roof, kind = 'gable', win = true) {
  m.box(x0, y0, 0, x1, y1, h, wall, kind === 'flat' ? roof : wall);
  if (kind === 'gable' || kind === 'steep') m.gable(x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.2, h, h + Math.min(x1 - x0, y1 - y0) * (kind === 'steep' ? 0.85 : 0.45), roof);
  if (kind === 'flat') m.box(x0 - 0.05, y0 - 0.05, h, x1 + 0.05, y1 + 0.05, h + 0.25, wall);   // מעקה גג
  if (win && h > 1.4) { const zs = []; for (let z = 0.8; z < h - 0.6; z += 1.6) zs.push(z); for (const z of zs) { windowsOn(m, x0, x1, y1, z, z + 0.7, 1); windowsOn(m, x0, x1, y0, z, z + 0.7, -1); } }
  return m;
}
function flag3(m, x, y, h, col) { m.box(x - 0.1, y - 0.1, 0, x + 0.1, y + 0.1, h, [0.85, 0.85, 0.82, 0]); m.box(x + 0.1, y - 0.05, h - 1.4, x + 2.4, y + 0.05, h, col); }
function g3Model(key, build) {
  if (G3.models.has(key)) return G3.models.get(key);
  const m = new Mesh(); build(m); const r = m.upload(); G3.models.set(key, r); return r;
}
const C3 = { slab: rgb('#6c6850'), conc: rgb('#7a786e'), asph: rgb('#3a3a38'), brick: rgb('#8a5a44'), wallL: rgb('#d6cdb4'), roofR: rgb('#a8553f'), roofG: rgb('#5c6a72'), metal: rgb('#8e9296'), dark: rgb('#3c3a36'), green: rgb('#4f6a3a'), olive: rgb('#6e7454'), sand: rgb('#a89a72') };
function buildingModel(b) {
  const col = rgb(S.nations[b.n].color), key = b.type + ':' + b.n + ':' + (b.dt || '');
  return g3Model(key, m => {
    const S2 = 9.5;
    if (b.type === 'camp') {
      m.box(-S2, -7.5, 0, S2, 7.5, 0.15, C3.slab);
      for (let k = 0; k < 3; k++) house(m, -8.6, -5.6 + k * 3.7, -1.2, -3.4 + k * 3.7, 2, rgb('#8a8470'), rgb(CAMP_TINT[b.dt] || '#6e7454'));
      m.box(0.6, -6.6, 0.15, 8.6, 0.2, 0.25, rgb('#9a8c68'));
      for (let k = 0; k < 4; k++) { const tx = 1.6 + (k % 2) * 3.6, ty = -5.6 + (k >> 1) * 3; m.gable(tx, ty, tx + 2.6, ty + 2, 0.2, 1.6, rgb(b.dt === 'cmdo' ? '#5e6448' : '#b4a882')); }
      house(m, 1, 2, 5, 4.8, 2.2, rgb('#7a7464'), C3.dark, 'flat');
      house(m, 5.8, 2.2, 8.6, 4.8, 2.6, rgb('#6c6656'), C3.metal, 'gable', false);
      flag3(m, 0.4, -0.4, 6, col);
    } else if (b.type === 'factory') {
      m.box(-S2, -7.5, 0, S2, 7.5, 0.12, rgb('#5c5a54'));
      // אולם ייצור עם גג משונן
      m.box(-8.6, -5.6, 0, 2.9, 2, 3.4, rgb('#7a5a46'));
      for (let k = 0; k < 6; k++) { const x0 = -8.6 + k * 1.92; m.quad([[x0, -5.6, 3.4], [x0 + 1.92, -5.6, 3.4], [x0 + 1.92, 2, 4.6], [x0, 2, 4.6]], [0, -0.7, 0.7], rgb('#8e8a80')); m.quad([[x0 + 1.92, 2, 3.4], [x0 + 1.92, -5.6, 3.4], [x0 + 1.92, -5.6, 3.4], [x0 + 1.92, 2, 4.6]], [1, 0, 0], rgb('#9fb6c0')); m.box(x0 + 1.84, -5.6, 3.4, x0 + 1.92, 2, 4.6, rgb('#9fb6c0')); }
      windowsOn(m, -8.6, 2.9, 2, 1, 2.2, 1);
      house(m, 3.8, -5.6, 8.4, -2, 4.2, rgb('#8a6a50'), rgb('#6e665c'), 'flat');
      m.box(3.8, -2.05, 3.6, 8.4, -1.95, 4.1, col);
      for (const cx of [5.1, 7.4]) m.cyl(cx, 0.8, 0.6, 0, 9, rgb('#7a4a38'), 8, rgb('#201c18'));
      m.box(-9.5, 5.2, 0.1, 9.5, 6.4, 0.25, C3.dark);
      house(m, -3.4, 3, 2, 4.8, 1.8, rgb('#5e5a52'), C3.metal, 'gable', false);
      for (let k = 0; k < 6; k++) { const bx = -8.4 + (k % 3) * 1.5, by = 2.8 + (k / 3 | 0) * 1.2; m.box(bx, by, 0, bx + 1.2, by + 1, 1, rgb(['#8a6e48', '#5a6e6e', '#7a6a4a'][k % 3])); }
    } else if (b.type === 'university') {
      m.box(-S2, -7.5, 0, S2, 7.5, 0.12, rgb('#5e6a3e'));
      m.box(-0.7, -1, 0.12, 0.7, 7.5, 0.18, rgb('#b0a27c')); m.box(-S2, 4.2, 0.12, S2, 5.3, 0.18, rgb('#b0a27c'));
      house(m, -8.4, -6.6, 8.4, -3.4, 3.4, C3.wallL, C3.roofR);
      house(m, -8.4, -3.4, -5, 2.4, 3, C3.wallL, C3.roofR); house(m, 5, -3.4, 8.4, 2.4, 3, C3.wallL, C3.roofR);
      for (let k = -2.4; k <= 2.4; k += 0.8) m.cyl(k, -3.1, 0.18, 0, 3, rgb('#ece4cc'), 6);
      m.box(-2.9, -3.5, 3, 2.9, -2.8, 3.4, rgb('#e8e0c8'));
      m.cyl(0, -5, 2, 3.4, 5.4, rgb('#e0d8c0'), 10); m.cone(0, -5, 2.1, 5.4, 7.6, rgb('#6c9a9a'), 10);
      m.cyl(0, 4.7, 1.8, 0.12, 0.5, rgb('#c4b892'), 10); m.cyl(0, 4.7, 0.9, 0.12, 0.52, rgb('#6a9aa8'), 10);
      for (const [tx, ty] of [[-6, 1.4], [-3.6, 2.6], [3.6, 2.6], [6, 1.4], [-7.6, 6.4], [7.6, 6.4]]) treeInto(m, tx, ty, 1.1);
      flag3(m, 8.6, 6.8, 5, col);
    } else if (b.type === 'fortress') {
      const star = (rO, rI, z0, z1, c) => { const P = []; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k & 1 ? rI : rO; P.push([Math.cos(a) * r, Math.sin(a) * r]); }
        for (let k = 0; k < 10; k++) { const p = P[k], q = P[(k + 1) % 10], nx = q[1] - p[1], ny = -(q[0] - p[0]), nl = Math.hypot(nx, ny); m.quad([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], [nx / nl, ny / nl, 0], c); m.tri([[0, 0, z1], [q[0], q[1], z1], [p[0], p[1], z1]], [0, 0, 1], c.map((v, i) => i < 3 ? v * 1.1 : v)); } };
      star(9.6, 6.6, -0.2, 0.1, rgb('#4a5a4a')); star(8.6, 5.8, 0, 2.6, rgb('#9a9078')); star(6.2, 4, 2.6, 2.7, rgb('#6e6650'));
      house(m, -2.4, -1.8, 2.4, 1.4, 4.2, rgb('#7a7262'), rgb('#5e5848'), 'flat', false);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2, x = Math.cos(a) * 7, y = Math.sin(a) * 7; m.cyl(x, y, 0.7, 2.6, 3.4, C3.dark, 6); m.box(x - 0.15 + Math.cos(a) * 0.5, y - 0.15 + Math.sin(a) * 0.5, 3, x + 0.15 + Math.cos(a) * 2.2, y + 0.15 + Math.sin(a) * 2.2, 3.3, C3.dark); }
      flag3(m, 0, -2.3, 8, col);
    } else if (b.type === 'airport') {
      m.box(-12.5, -5, 0, 12.5, 10, 0.1, rgb('#6a6c4c'));
      m.box(-12, -3.8, 0.1, 12, 0.6, 0.2, C3.asph);
      for (let k = 0; k < 10; k++) m.box(-10.6 + k * 2.3, -1.75, 0.2, -9.3 + k * 2.3, -1.45, 0.22, rgb('#e0e0d8'));
      m.box(-5, 0.6, 0.1, -3.6, 3.8, 0.2, C3.asph); m.box(-5, 3.4, 0.1, 10, 4.8, 0.2, C3.asph);
      for (let k = 0; k < 2; k++) { const x0 = 1 + k * 4.6; m.box(x0, 5.4, 0, x0 + 4, 8.8, 1.4, rgb('#7a7a72')); m.gable(x0, 5.4, x0 + 4, 8.8, 1.4, 3.2, rgb('#9a9a92')); }
      house(m, -10.6, 4.6, -8.4, 6.8, 6, rgb('#8a8270'), C3.dark, 'flat', false); m.box(-10.8, 4.4, 6, -8.2, 7, 7.2, rgb('#7ad8ff', 1));
      m.box(1, 5.3, 2.6, 9.6, 5.4, 3, col);
      flag3(m, -6.8, 8.6, 5, col);
    } else if (b.type === 'port') {
      m.box(-S2, -7.5, 0, 1.2, 7.5, 0.5, rgb('#6e6a60'));
      house(m, -8.8, -6.6, -3.2, -3, 3, rgb('#8a6a4c'), rgb('#7a5a40')); house(m, -8.8, -1.6, -3.2, 2, 2.6, rgb('#8a6a4c'), C3.metal, 'gable', false);
      m.box(-8.8, -6.7, 2.4, -3.2, -6.6, 2.9, col);
      for (const Y of [-5.2, 3.2]) m.box(1.2, Y, 0.1, 8.8, Y + 1.2, 0.45, rgb('#806c4c'));
      for (let k = 0; k < 6; k++) { const cx = -2.6 + (k % 3) * 1.1, cy = 3.6 + (k / 3 | 0) * 1.6; m.box(cx, cy, 0.5, cx + 1, cy + 1.4, 1.6, rgb(['#a04a3a', '#3a6a7a', '#b08a3a', '#5a7a4a', '#7a4a6a', '#4a5a8a'][k])); }
      const Y = rgb('#d8a838'); m.box(0.3, -1.4, 0.5, 0.6, -1.1, 7, Y); m.box(-1.1, -1.4, 0.5, -0.8, -1.1, 7, Y); m.box(-1.6, -1.5, 7, 6, -1, 7.5, Y);
      flag3(m, -9, 7, 5, col);
    }
  });
}
function treeInto(m, x, y, r, c) { m.cyl(x, y, r * 0.18, 0, r * 1.2, rgb('#5a4630'), 5); m.cone(x, y, r * 1.2, r * 0.9, r * 3.4, c || rgb('#3c4f2c'), 7); m.cone(x, y, r * 0.9, r * 2.1, r * 4.2, (c || rgb('#3c4f2c')).map((v, i) => i < 3 ? v * 1.15 : v), 7); }
// ===== סגנון בנייה לפי אקלים (סבב גרפיקה 2) =====
// מוערך מהשטח סביב המקום ומקו הרוחב (צפון קר, דרום חם): הרים/שלג → אבן וגגות תלולים; יער → עץ כהה; חוף/דרום → קירות לבנים או חוליים וגגות שטוחים
const CLIM = new Map();
function climateAt(j) {
  if (CLIM.s !== S) { CLIM.clear(); CLIM.s = S; } const key = j; if (CLIM.has(key)) return CLIM.get(key);
  const [x, y] = XY(j), R = 4 * G; let n = 0, mt = 0, fo = 0, sa = 0, wa = 0;
  for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy += 2) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx += 2) { const t = S.terrain[yy * W + xx]; n++; if (t === MOUNT || t === SNOW) mt++; else if (t === FOREST) fo++; else if (t === SAND) sa++; else if (TER[t].water) wa++; }
  const lat = y / H, c = mt / n > 0.22 || (lat < 0.15 && mt / n > 0.08) ? 'alpine' : (lat > 0.72 && fo / n < 0.3) || sa / n > 0.12 ? 'arid' : wa / n > 0.28 ? 'med' : fo / n > 0.35 ? 'wood' : 'temperate';
  CLIM.set(key, c); return c;
}
const STYLE = {
  temperate: { wall: WALL2, roof: ROOF2, kind: 'gable', flat: 0.15 },
  med:       { wall: ['#efebe2', '#e6e0d2', '#f3f0e8', '#ddd6c4'], roof: ['#c0603a', '#b5583a', '#c87048'], kind: 'gable', flat: 0.45 },
  arid:      { wall: ['#d8bf8c', '#cdb07a', '#e0c99a', '#c9a874'], roof: ['#e6d2a6', '#dcc492'], kind: 'flat', flat: 1, court: true },
  wood:      { wall: ['#6e5238', '#7a5a3c', '#5e4632', '#866446'], roof: ['#4a4038', '#5a4a3c', '#3e3a34'], kind: 'steep', flat: 0 },
  alpine:    { wall: ['#9a968c', '#8a867c', '#a8a498', '#7e7a70'], roof: ['#5c6268', '#4e545a', '#d8dce2'], kind: 'steep', flat: 0 },
};
// בית בסגנון: גג לפי האקלים, ובאקלים צחיח — חומת חצר נמוכה עם פתח
function styledHouse(m, st, x0, y0, x1, y1, h, k, i, big) {
  const wall = rgb(st.wall[(hash01(k, i, 18) * st.wall.length) | 0]), roof = rgb(st.roof[(hash01(i, k, 15) * st.roof.length) | 0]);
  const kind = hash01(k, i, 19) < st.flat || (big && hash01(k, 1, 1) < 0.5 && st.flat > 0) ? 'flat' : st.kind;
  house(m, x0, y0, x1, y1, h, wall, kind === 'flat' ? wall.map(v => v * 0.92) : roof, kind);
  if (st.court && hash01(k, i, 23) < 0.6) { const p = 0.9, hw = 0.8, cw = wall.map(v => v * 0.95);
    m.box(x0 - p, y1 + p - 0.25, 0, x1 + p, y1 + p, hw, cw); m.box(x0 - p, y0 - p, 0, x0 - p + 0.25, y1 + p, hw, cw); m.box(x1 + p - 0.25, y0 - p, 0, x1 + p, y1 + p, hw, cw);
    m.box(x0 - p, y0 - p, 0, (x0 + x1) / 2 - 0.6, y0 - p + 0.25, hw, cw); m.box((x0 + x1) / 2 + 0.6, y0 - p, 0, x1 + p, y0 - p + 0.25, hw, cw); }
}
// כפר ניטרלי בתלת-ממד: אשכול בתים בסגנון האזור (עיר ניטרלית — יותר בתים וחומה)
function villageModel(mi) {
  const m0 = S.minors[mi], st = STYLE[climateAt(m0.town)], key = 'vil:' + mi + ':' + climateAt(m0.town);
  return g3Model(key, m => {
    const n = m0.town && m0.kind === 'town' ? 14 : 6, rad = m0.kind === 'town' ? 11 : 6.5, occ = [];
    for (let k = 0; k < n * 2 && occ.length < n; k++) {
      const a = hash01(mi, k, 31) * 6.283, r = (0.1 + 0.9 * Math.sqrt(hash01(k, mi, 32))) * rad, hx = Math.cos(a) * r, hy = Math.sin(a) * r * 0.85;
      const w = 2.1 + hash01(mi + k, 3, 33) * 1.4, d = 1.8 + hash01(k, mi + 3, 34) * 1.1;
      if (occ.some(([ox, oy, ow, od]) => Math.abs(ox - hx) < (ow + w) / 2 + (st.court ? 1.8 : 0.4) && Math.abs(oy - hy) < (od + d) / 2 + (st.court ? 1.8 : 0.4))) continue; occ.push([hx, hy, w, d]);
      styledHouse(m, st, hx - w / 2, hy - d / 2, hx + w / 2, hy + d / 2, 1.5 + hash01(k, 5, 35) * 0.9, k, mi, false);
    }
    if (m0.kind === 'town') { const c = rgb(st.wall[0]).map(v => v * 0.8); for (let k = 0; k < 28; k++) { if (k % 7 === 3) continue; const a = k / 28 * 6.283, a2 = (k + 1) / 28 * 6.283, R = rad + 2.2, x0 = Math.cos(a) * R, y0 = Math.sin(a) * R * 0.85, x1 = Math.cos(a2) * R, y1 = Math.sin(a2) * R * 0.85; m.box(Math.min(x0, x1) - 0.3, Math.min(y0, y1) - 0.3, 0, Math.max(x0, x1) + 0.3, Math.max(y0, y1) + 0.3, 1.4, c); } }
  });
}
// עיר: אותו פריסת בתים כמו בציור הדו-ממדי
function townModel(i, b) {
  const lvl = b.lvl || 1, st = STYLE[climateAt(i)], key = 'town:' + i + ':' + lvl + ':' + (b.capital ? 1 : 0) + ':' + b.n + ':' + climateAt(i);
  return g3Model(key, m => {
    const rad = townRad(b), ns = 3 + lvl, angs = Array.from({ length: ns }, (_, k) => hash01(i, k, 21) * 6.283);
    const n = Math.round((6 + lvl * 6 + (b.capital ? 8 : 0)) * 1.7), occ = [];
    for (let k = 0; k < n; k++) {
      const a = angs[k % ns] + (hash01(i, k, 11) - 0.5) * 0.9, r = (0.15 + 0.75 * Math.sqrt(hash01(k, i, 12))) * rad, side = hash01(k, i, 16) < 0.5 ? -1 : 1;
      const hx = Math.cos(a) * r + Math.cos(a + 1.57) * side * 1.9, hy = (Math.sin(a) * r + Math.sin(a + 1.57) * side * 1.9) * 0.84;
      const big = r < rad * 0.35, w = (big ? 3.2 : 2.3) + (hash01(i + k, 3, 13) * 3 | 0) * 0.6, d = (big ? 2.6 : 2) + (hash01(k, i + 3, 14) * 2 | 0) * 0.5;
      if (b.capital && Math.abs(hx) < 5.5 && Math.abs(hy) < 5) continue;
      if (occ.some(([ox, oy, ow, od]) => Math.abs(ox - hx) < (ow + w) / 2 && Math.abs(oy - hy) < (od + d) / 2)) continue; occ.push([hx, hy, w, d]);
      const h = (big ? 2.4 + lvl * 0.8 + hash01(k, 9, 3) * 2 : 1.6 + hash01(k, 5, 17) * 0.8);
      styledHouse(m, st, hx - w / 2, hy - d / 2, hx + w / 2, hy + d / 2, h, k, i, big && lvl >= 3);
    }
    // פנסי רחוב לאורך הרחובות (נדלקים בלילה)
    for (const a of angs) for (let r = rad * 0.3; r < rad * 1.05; r += 3.6) { const ox = Math.cos(a + 1.57) * 0.9, oy = Math.sin(a + 1.57) * 0.9 * 0.84, x = Math.cos(a) * r + ox, y = Math.sin(a) * r * 0.84 + oy; if (occ.some(([hx, hy, w, d]) => Math.abs(hx - x) < w / 2 + 0.2 && Math.abs(hy - y) < d / 2 + 0.2)) continue; m.box(x - 0.08, y - 0.08, 0, x + 0.08, y + 0.08, 2.6, [0.2, 0.2, 0.22, 0]); m.box(x - 0.22, y - 0.22, 2.6, x + 0.22, y + 0.22, 2.9, [1, 0.85, 0.55, 1]); }
    for (let k = 0; k < 6 + lvl * 2; k++) { const a = hash01(i, k, 41) * 6.283, r = (0.4 + 0.7 * hash01(k, i, 42)) * rad, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.84; if (occ.some(([ox, oy, ow, od]) => Math.abs(ox - x) < ow / 2 + 0.6 && Math.abs(oy - y) < od / 2 + 0.6)) continue; treeInto(m, x, y, 0.7 + hash01(k, k, 43) * 0.5); }
    if (b.capital) {
      m.box(-4.6, -3.8, 0, 4.6, 4.2, 0.15, rgb('#c4baa0'));
      house(m, -3.4, -3.2, 3.4, 1, 4.4, rgb('#e4dcc4'), rgb('#6a7a8a'), 'flat');
      m.cyl(0, -1.1, 1.8, 4.4, 5.6, rgb('#e4dcc4'), 10); m.cone(0, -1.1, 1.9, 5.6, 8.4, rgb('#c8a848'), 10);
      flag3(m, 2.9, -2.6, 9, rgb(S.nations[b.n].color));
    }
  });
}
// קרקע העיר (רחובות) — מצוירת לתמונת הקרקע
function drawTownGround(i, b) {
  const T = CFG.T, [x, y] = XY(i), rad = townRad(b), lvl = b.lvl || 1, ns = 3 + lvl, cx = x * T + T / 2, cy = y * T + T / 2;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(120,112,96,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.05, rad * 0.9, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(70,68,62,.9)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath();
  for (let k = 0; k < ns; k++) { const a = hash01(i, k, 21) * 6.283; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rad * 1.1, Math.sin(a) * rad * 0.9); }
  ctx.ellipse(0, 0, rad * 0.55, rad * 0.46, 0, 0, 7); ctx.stroke(); ctx.restore();
}
// יחידות: מודלים מקוביות, פונים ל-+x, גובה בערך פי 1.3 מהמציאות כדי שייראו
function unitModel(t) {
  return g3Model('u:' + t, m => {
    const uni = [0.5, 0.52, 0.38, 2], dk = [0.28, 0.29, 0.26, 0], met = [0.2, 0.21, 0.2, 0];
    if (t === 'inf' || t === 'cmdo') {
      m.box(-0.3, -0.45, 0, 0.2, -0.1, 1.1, [0.32, 0.33, 0.26, 0]); m.box(-0.3, 0.1, 0, 0.2, 0.45, 1.1, [0.32, 0.33, 0.26, 0]);   // רגליים
      m.box(-0.35, -0.55, 1.1, 0.3, 0.55, 2.2, uni);                                                                            // גוף
      m.box(-0.7, -0.4, 1.2, -0.35, 0.4, 2, dk);                                                                                 // תרמיל
      m.box(-0.25, -0.25, 2.2, 0.25, 0.25, 2.65, [0.85, 0.7, 0.55, 0]);                                                          // ראש
      m.box(-0.32, -0.32, 2.5, 0.32, 0.32, 2.9, t === 'cmdo' ? [0.22, 0.26, 0.2, 0] : [0.35, 0.38, 0.28, 0]);                    // קסדה
      m.box(0.2, 0.3, 1.5, 1.5, 0.45, 1.65, [0.18, 0.15, 0.12, 0]);                                                              // רובה
    } else if (t === 'infK' || t === 'cmdoK') {   // כורע: רגל אחת מקופלת, גוף נמוך, רובה מכוון
      m.box(-0.5, -0.45, 0, 0.35, -0.1, 0.55, [0.32, 0.33, 0.26, 0]); m.box(0.1, 0.1, 0, 0.5, 0.45, 0.9, [0.32, 0.33, 0.26, 0]);
      m.box(-0.4, -0.55, 0.55, 0.25, 0.55, 1.6, uni); m.box(-0.75, -0.4, 0.65, -0.4, 0.4, 1.45, dk);
      m.box(-0.2, -0.25, 1.6, 0.3, 0.25, 2.05, [0.85, 0.7, 0.55, 0]); m.box(-0.27, -0.32, 1.9, 0.37, 0.32, 2.3, t === 'cmdoK' ? [0.22, 0.26, 0.2, 0] : [0.35, 0.38, 0.28, 0]);
      m.box(0.25, -0.08, 1.45, 1.8, 0.08, 1.6, [0.18, 0.15, 0.12, 0]);
    } else if (t === 'infP' || t === 'infD' || t === 'body') {   // שוכב: על הבטן ויורה / פצוע / גופה
      const u2 = t === 'body' ? [0.36, 0.36, 0.3, 0] : uni, red = [0.55, 0.08, 0.06, 0];
      m.box(-2.5, -0.45, 0, -1.5, 0.45, 0.4, [0.32, 0.33, 0.26, 0]); m.box(-1.6, -0.55, 0, 0.5, 0.55, 0.65, u2); m.box(-1.3, -0.4, 0.65, -0.2, 0.4, 0.95, dk);
      m.box(0.5, -0.25, 0.05, 1.0, 0.25, 0.55, [0.85, 0.7, 0.55, 0]); m.box(0.5, -0.32, 0.3, 1.05, 0.32, 0.7, [0.35, 0.38, 0.28, 0]);
      if (t === 'infP') m.box(0.8, 0.25, 0.25, 2.3, 0.4, 0.4, [0.18, 0.15, 0.12, 0]); else m.box(-0.9, -0.3, 0.66, -0.2, 0.3, 0.72, red);
    } else if (t === 'rock') { m.box(-0.9, -0.7, 0, 0.8, 0.7, 0.8, [0.46, 0.44, 0.4, 0]); m.box(-0.5, -0.4, 0.8, 0.4, 0.5, 1.2, [0.52, 0.5, 0.46, 0]); m.box(0.5, -0.9, 0, 1.2, -0.2, 0.5, [0.42, 0.4, 0.37, 0]);
    } else if (t === 'ltank' || t === 'htank') {
      const H_ = t === 'htank', L = H_ ? 3.2 : 2.6, Wd = H_ ? 1.9 : 1.6;
      m.box(-L, -Wd, 0, L, -Wd + 0.6, 0.9, met); m.box(-L, Wd - 0.6, 0, L, Wd, 0.9, met);
      m.box(-L + 0.2, -Wd + 0.5, 0.4, L - 0.1, Wd - 0.5, 1.5, uni);
      m.box(-L + 0.2, -Wd + 0.6, 1.5, -L + 1, Wd - 0.6, 1.7, dk);
      m.cyl(0, 0, H_ ? 1.25 : 1, 1.5, 2.4, uni, 8, uni);
      m.box(0.6, -0.15, 1.8, 0.6 + (H_ ? 3.8 : 3), 0.15, 2.1, met);
    } else if (t === 'art') {
      m.box(-0.4, -1.3, 0, 0.4, -0.9, 0.9, met); m.box(-0.4, 0.9, 0, 0.4, 1.3, 0.9, met);
      m.box(-0.3, -0.9, 0.5, 0.5, 0.9, 1.6, uni);
      m.box(-3, -0.9, 0.1, -0.2, -0.6, 0.35, dk); m.box(-3, 0.6, 0.1, -0.2, 0.9, 0.35, dk);
      m.box(0.3, -0.18, 1.1, 3.8, 0.18, 1.45, met);
    } else if (t === 'aa') {
      m.box(-2.4, -1.2, 0.3, 2.4, 1.2, 1.5, uni); m.box(1.2, -1.1, 1.5, 2.4, 1.1, 2.4, dk);
      m.cyl(-0.6, 0, 0.8, 1.5, 2.1, dk, 8); for (const o of [-0.45, -0.15, 0.15, 0.45]) m.box(-0.4, o - 0.07, 2.1, 1.8, o + 0.07, 2.25, met);
      for (const X of [-1.8, -0.4, 1.4]) { m.box(X - 0.35, -1.4, 0, X + 0.35, -1.1, 0.7, met); m.box(X - 0.35, 1.1, 0, X + 0.35, 1.4, 0.7, met); }
    } else if (t === 'cargo') {   // משאית סחר: תא נהג בצבע האומה, ארגזים צבעוניים מאחור
      m.box(0.9, -1, 0.5, 2.5, 1, 2, uni); m.box(2.45, -0.8, 1.2, 2.55, 0.8, 1.85, [0.5, 0.7, 0.85, 0]); m.box(-2.6, -1.05, 0.5, 0.8, 1.05, 0.8, [0.3, 0.27, 0.22, 0]);
      m.box(-2.5, -0.95, 0.8, -1.0, 0.0, 1.8, [0.62, 0.42, 0.24, 0]); m.box(-2.5, 0.05, 0.8, -1.0, 0.95, 1.6, [0.35, 0.5, 0.58, 0]); m.box(-0.9, -0.95, 0.8, 0.7, 0.95, 2.1, [0.72, 0.62, 0.4, 0]);
      for (const X of [-1.9, -0.3, 1.7]) { m.box(X - 0.35, -1.15, 0, X + 0.35, -0.95, 0.7, met); m.box(X - 0.35, 0.95, 0, X + 0.35, 1.15, 0.7, met); }
    } else if (t === 'truck') {
      m.box(-2.4, -1, 0.5, 0.8, 1, 2.3, [0.45, 0.47, 0.35, 0]); m.box(0.8, -1, 0.5, 2.4, 1, 1.9, uni); m.box(2.35, -0.8, 1.2, 2.45, 0.8, 1.8, [0.5, 0.7, 0.85, 0]);
      for (const X of [-1.8, -0.4, 1.6]) { m.box(X - 0.35, -1.15, 0, X + 0.35, -0.95, 0.7, met); m.box(X - 0.35, 0.95, 0, X + 0.35, 1.15, 0.7, met); }
    } else if (t === 'tree') treeInto(m, 0, 0, 1, [0.24, 0.32, 0.17, 0]);
    else if (t === 'palm') { for (let q = 0; q < 6; q++) { const z0 = q * 0.9; m.box(-0.22 + q * 0.06, -0.22, z0, 0.22 + q * 0.06, 0.22, z0 + 0.95, [0.45, 0.36, 0.24, 0]); } const tx = 0.36, tz = 5.4; for (let q = 0; q < 6; q++) { const a = q / 6 * 6.283; m.quad([[tx, 0, tz], [tx + Math.cos(a) * 2.6, Math.sin(a) * 2.6, tz - 1.1], [tx + Math.cos(a + 0.35) * 2.3, Math.sin(a + 0.35) * 2.3, tz - 0.9], [tx + Math.cos(a + 0.2) * 0.4, Math.sin(a + 0.2) * 0.4, tz + 0.1]], [0, 0, 1], [0.28 + q * 0.01, 0.42, 0.18, 0]); } }
    else if (t === 'bush') { m.box(-0.9, -0.8, 0, 0.9, 0.8, 1.1, [0.24, 0.33, 0.17, 0]); m.box(-0.6, -0.55, 1.1, 0.6, 0.55, 1.6, [0.29, 0.39, 0.2, 0]); }
    else if (t === 'tree2') { m.cyl(0, 0, 0.2, 0, 1.4, [0.35, 0.27, 0.19, 0], 5); m.box(-1.1, -1.1, 1.2, 1.1, 1.1, 3, [0.28, 0.38, 0.19, 0]); m.box(-0.7, -0.7, 3, 0.7, 0.7, 3.8, [0.33, 0.44, 0.22, 0]); }
    else if (t === 'plane') {   // מטוס קרב: גוף, כנפיים משוכות, זנב
      const body = [0.55, 0.58, 0.6, 2], dk2 = [0.3, 0.32, 0.34, 0];
      m.box(-3, -0.45, -0.4, 3, 0.45, 0.4, body); m.box(3, -0.3, -0.3, 3.9, 0.3, 0.25, body); m.box(1.8, -0.25, 0.3, 3, 0.25, 0.65, [0.5, 0.75, 0.9, 0]);
      m.quad([[1.2, 0, 0], [-1.6, 4, 0], [-2.4, 4, 0], [-1.4, 0, 0]], [0, 0, 1], body); m.quad([[-1.4, 0, 0], [-2.4, -4, 0], [-1.6, -4, 0], [1.2, 0, 0]], [0, 0, 1], body);
      m.quad([[-2.2, 0, 0.1], [-3.2, 1.6, 0.1], [-3.6, 1.6, 0.1], [-3, 0, 0.1]], [0, 0, 1], body); m.quad([[-3, 0, 0.1], [-3.6, -1.6, 0.1], [-3.2, -1.6, 0.1], [-2.2, 0, 0.1]], [0, 0, 1], body);
      m.box(-3.2, -0.08, 0.3, -2.2, 0.08, 1.8, dk2);
    } else if (t === 'heli') {   // מסוק: גוף, זנב, מגלשיים
      const body = [0.42, 0.46, 0.36, 2];
      m.box(-1.4, -0.9, -0.6, 1.6, 0.9, 1.1, body); m.box(1.2, -0.75, -0.3, 2.1, 0.75, 0.9, [0.5, 0.72, 0.85, 0]); m.box(-4.6, -0.2, 0.2, -1.4, 0.2, 0.7, body); m.box(-4.8, -0.08, 0.4, -4.2, 0.08, 1.8, body);
      m.box(-1.4, -1.1, -1.1, 1.6, -0.95, -1, [0.2, 0.2, 0.2, 0]); m.box(-1.4, 0.95, -1.1, 1.6, 1.1, -1, [0.2, 0.2, 0.2, 0]); m.box(-0.1, -0.1, 1.1, 0.1, 0.1, 1.5, [0.2, 0.2, 0.2, 0]);
    } else if (t === 'rotor') { m.box(-4.2, -0.18, 0, 4.2, 0.18, 0.08, [0.15, 0.15, 0.15, 0]); m.box(-0.18, -4.2, 0, 0.18, 4.2, 0.08, [0.15, 0.15, 0.15, 0]); }
    else if (t === 'ship') {   // ספינה: גוף מחודד, מבנה עילי, ארובה בצבע האומה
      const hull = [0.32, 0.33, 0.35, 0];
      m.box(-4, -1.3, -0.4, 2.6, 1.3, 0.8, hull); m.quad([[2.6, -1.3, 0.8], [4.4, 0, 0.8], [4.4, 0, 0.8], [2.6, 1.3, 0.8]], [0, 0, 1], hull);
      m.quad([[2.6, -1.3, -0.4], [4.4, 0, -0.4], [4.4, 0, 0.8], [2.6, -1.3, 0.8]], [0.6, -0.8, 0], hull); m.quad([[4.4, 0, -0.4], [2.6, 1.3, -0.4], [2.6, 1.3, 0.8], [4.4, 0, 0.8]], [0.6, 0.8, 0], hull);
      m.box(-4, -1.3, 0.8, 2.6, 1.3, 0.85, [0.55, 0.5, 0.42, 0]);
      m.box(-2.6, -0.9, 0.85, 0.4, 0.9, 2.2, [0.85, 0.85, 0.8, 0]); for (let x = -2.2; x < 0.2; x += 0.7) m.box(x, 0.92, 1.5, x + 0.4, 0.95, 1.8, LIT);
      m.cyl(-1.6, 0, 0.45, 2.2, 3.4, [0.6, 0.6, 0.6, 2], 8); m.box(1, -0.7, 0.85, 2.2, 0.7, 1.5, [0.6, 0.45, 0.3, 0]);
    } else if (t === 'loco') { m.box(-2.4, -0.9, 0.4, 2.4, 0.9, 2.2, [0.25, 0.27, 0.3, 2]); m.cyl(1.6, 0, 0.35, 2.2, 3, [0.15, 0.15, 0.15, 0], 6); m.box(-2.4, -1, 0, 2.4, 1, 0.45, [0.15, 0.15, 0.15, 0]); m.box(-2.3, -0.95, 1.4, -1.2, 0.95, 1.9, LIT); }
    else if (t === 'wagon') { m.box(-2.2, -0.9, 0.4, 2.2, 0.9, 1.9, [0.5, 0.35, 0.25, 0]); m.box(-2.2, -1, 0, 2.2, 1, 0.45, [0.15, 0.15, 0.15, 0]); m.box(-2.3, -0.95, 1.9, 2.3, 0.95, 2.05, [0.35, 0.3, 0.25, 0]); }
    else if (t === 'wreck') { m.box(-2.4, -1.5, 0, 2.4, 1.5, 1.1, [0.13, 0.12, 0.11, 0]); m.cyl(0.3, 0.2, 0.9, 1.1, 1.6, [0.16, 0.14, 0.12, 0], 6); }
  });
}

/* ---- מטריצות ---- */
function mat4Mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
// מצלמה ראשית: עמודות (column-major). x מסך = (x-cx)*z ; y מסך = (y-cy)*z*cos - h*z*sin ; עומק = (y-cy)*sin + h*cos
function camMatrix() {
  const z = view.cam.zoom, [cx, cy] = g3C(), sx = 2 * z / innerWidth, sy = 2 * z / innerHeight, c = G3.cos, s = G3.sin, D = 1 / 1600;
  // NDC: X = (x-cx)*sx ; Y = -((y-cy)*c - h*s)*sy ; Z = -((y-cy)*s + h*c)*D  (קרוב יותר = Z קטן)
  return new Float32Array([sx, 0, 0, 0, 0, -c * sy, -s * D, 0, 0, s * sy, -c * D, 0, -cx * sx, cy * c * sy, cy * s * D, 1]);
}
// מטריצת השמש (אורתוגרפית) סביב אזור הקרקע
function sunState() {
  const ph = (S.time / CFG.DAY_CYCLE) % 1, ang = (ph + 0.25) * Math.PI * 2, dayH = Math.sin(ang), isMoon = dayH < 0;   // ph=0 צהריים, 0.75 זריחה, 0.25 שקיעה
  const a2 = isMoon ? ang - Math.PI : ang, el = isMoon ? Math.max(0.35, -dayH) * 0.9 : Math.max(0.16, dayH);
  const d = [Math.cos(a2) * 0.85, -0.5, el * 1.5], L = Math.hypot(...d);
  const warm = isMoon ? 0 : clamp(1 - dayH * 2.6, 0, 1), lum = isMoon ? 0 : clamp(dayH * 4, 0, 1);
  const sunCol = isMoon ? [0.34, 0.42, 0.62] : [1.08 + warm * 0.12, 0.98 - warm * 0.22, 0.86 - warm * 0.45].map(v => v * (0.35 + 0.65 * lum));
  const amb = isMoon ? [0.24, 0.28, 0.42] : [0.4 + warm * 0.08, 0.42 - warm * 0.04, 0.5 - warm * 0.12].map(v => v * (0.75 + 0.25 * lum));
  return { dir: d.map(v => v / L), sunCol, amb, night: clamp(nightLevel_() * 1.5, 0, 1) };
}
function lightMatrix(sun, fp) {
  const [dx, dy, dz] = sun.dir, cx = (fp.x0 + fp.x1) / 2, cy = (fp.y0 + fp.y1) / 2, R = Math.max(fp.x1 - fp.x0, fp.y1 - fp.y0) * 0.6;
  // בסיס: f = -dir (כיוון המבט של האור), r = ניצב
  const f = [-dx, -dy, -dz], up0 = Math.abs(dz) > 0.95 ? [0, 1, 0] : [0, 0, 1];
  let r = [f[1] * up0[2] - f[2] * up0[1], f[2] * up0[0] - f[0] * up0[2], f[0] * up0[1] - f[1] * up0[0]]; const rl = Math.hypot(...r); r = r.map(v => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const s = 1 / R, D = 1 / 400, ex = cx - f[0] * 200, ey = cy - f[1] * 200, ez = -f[2] * 200;
  const tx = -(r[0] * ex + r[1] * ey + r[2] * ez), ty = -(u[0] * ex + u[1] * ey + u[2] * ez), tz = -(f[0] * ex + f[1] * ey + f[2] * ez);
  return new Float32Array([r[0] * s, u[0] * s, f[0] * 2 * D, 0, r[1] * s, u[1] * s, f[1] * 2 * D, 0, r[2] * s, u[2] * s, f[2] * 2 * D, 0, tx * s, ty * s, tz * 2 * D - 1, 1]);
}

/* ---- אזור הקרקע: תמונה + רשת גובה ---- */
function footprintNeeded() {
  const z = view.cam.zoom, [cx, cy] = g3C(), hw = innerWidth / 2 / z + 24, hh = innerHeight / 2 / z / G3.cos;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh - 24, y1: cy + hh + 24 * CFG.H3 * G3.sin / Math.max(0.3, G3.cos) + 30, z };
}
function g3Footprint() {
  const need = footprintNeeded(), fp = G3.fp, T = CFG.T;
  const inside = fp && need.x0 >= fp.x0 && need.x1 <= fp.x1 && need.y0 >= fp.y0 && need.y1 <= fp.y1 && Math.abs(Math.log(need.z / fp.z)) < 0.2;
  if (inside) return false;
  const padX = (need.x1 - need.x0) * 0.25, padY = (need.y1 - need.y0) * 0.25, Q = 4 * T;
  G3.fp = { x0: Math.floor((need.x0 - padX) / Q) * Q, x1: Math.ceil((need.x1 + padX) / Q) * Q, y0: Math.floor((need.y0 - padY) / Q) * Q, y1: Math.ceil((need.y1 + padY) / Q) * Q, z: need.z };
  g3BuildMesh(); G3.gT = 0; G3.trees = null; return true;
}
function g3BuildMesh() {
  const gl = G3.gl, fp = G3.fp, T = CFG.T, st = T / 2, nx = Math.round((fp.x1 - fp.x0) / st), ny = Math.round((fp.y1 - fp.y0) / st);
  const hgt = (x, y) => g3H(x, y), v = new Float32Array((nx + 1) * (ny + 1) * 10), idxA = new Uint32Array(nx * ny * 6);
  let o = 0; for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = fp.x0 + i * st, y = fp.y0 + j * st, h = hgt(x, y), hx = hgt(x + st, y) - hgt(x - st, y), hy = hgt(x, y + st) - hgt(x, y - st), n = [-hx / (2 * st), -hy / (2 * st), 1], L = Math.hypot(...n);
    v.set([x, y, h, n[0] / L, n[1] / L, n[2] / L, 1, 1, 1, 0], o); o += 10;
  }
  let k = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idxA.set([a, c, b, b, c, d], k); k += 6; }
  if (G3.mesh) { gl.deleteBuffer(G3.mesh.buf); gl.deleteBuffer(G3.mesh.ib); gl.deleteVertexArray(G3.mesh.vao); }
  const vao = gl.createVertexArray(), buf = gl.createBuffer(), ib = gl.createBuffer(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxA, gl.STATIC_DRAW); gl.bindVertexArray(null);
  G3.mesh = { vao, buf, ib, n: idxA.length };
}
// תמונת הקרקע: כל מה ששוכב על הקרקע (שטח, שליטה, כבישים, רחובות ערים, אזורי קרב, יעדים, סימון)
function g3GroundTexture(now) {
  const fp = G3.fp, T = CFG.T, dpr = devicePixelRatio || 1;
  const TX = matchMedia('(pointer:coarse)').matches ? 2048 : 4096, gz = Math.min(fp.z * dpr * 1.1, TX / (fp.x1 - fp.x0), TX / (fp.y1 - fp.y0), 8), w = Math.round((fp.x1 - fp.x0) * gz), h = Math.round((fp.y1 - fp.y0) * gz);
  if (!G3.gCv) { G3.gCv = document.createElement('canvas'); G3.gCtx = G3.gCv.getContext('2d'); }
  if (G3.gCv.width !== w || G3.gCv.height !== h) { G3.gCv.width = w; G3.gCv.height = h; }
  const main = ctx; ctx = G3.gCtx;
  try {
    ctx.setTransform(gz, 0, 0, gz, -fp.x0 * gz, -fp.y0 * gz); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b1018'; ctx.fillRect(fp.x0, fp.y0, fp.x1 - fp.x0, fp.y1 - fp.y0);
    const vis = { x0: fp.x0, y0: fp.y0, x1: fp.x1, y1: fp.y1 };
    drawTerrain(gz, vis);
    if (view.ownerDirty) rebuildOwner(); else updateOwnerTiles();
    ctx.drawImage(ownerCv, 0, 0, W * T, H * T);
    if (gz < TP.ZD) ctx.drawImage(railCv, 0, 0, W * T, H * T); else drawInfraChunks(vis);
    eachBuilding((b, i) => { if (b.type !== 'city' || !done(b)) return; const [x, y] = XY(i); if (x * T < fp.x0 - 60 || x * T > fp.x1 + 60 || y * T < fp.y0 - 60 || y * T > fp.y1 + 60) return; drawTownGround(i, b); });
    if (ui.pick?.kind === 'build' && view.hintCv) ctx.drawImage(view.hintCv, 0, 0, W * T, H * T);
    for (const f of S.fronts) if (f.kind === 'land' && f.zone?.length) { const col = S.nations[f.n].color; for (const j of f.zone) { const [x, y] = XY(j), p = Math.min(1, (f.prog[j] || 0) / (tileDefense(j) * CFG.TILE_DEF_K)); ctx.globalAlpha = 0.14 + 0.4 * p; ctx.fillStyle = col; ctx.fillRect(x * T, y * T, T, T); } ctx.globalAlpha = 1; }
    drawTracks(ctx, fp); for (const d of DECALS) { if (d.x < fp.x0 - 20 || d.x > fp.x1 + 20 || d.y < fp.y0 - 20 || d.y > fp.y1 + 20) continue; drawCrater(ctx, d); }
    drawPasses(ctx, null); drawBridges(ctx, null); drawWorks(ctx, null); drawMinors(ctx, null, true); drawMapMode(ctx); drawFog(ctx);
    for (const op of S.ops) if (op.n === 0) for (const o of op.objectives) { if (o.done) continue; const [x, y] = XY(o.tile), cx = x * T + T / 2, cy = y * T + T / 2, r = o.main ? 12 : 7; ctx.strokeStyle = o.main || o.custom ? '#ffd84a' : o.type === 'encircle' ? '#ff9a3c' : '#ff4f6a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.stroke(); }
    if (ui.sel != null) { const [x, y] = XY(ui.sel); ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 1; ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1); }
  } finally { ctx = main; }
  const gl = G3.gl; gl.bindTexture(gl.TEXTURE_2D, G3.gTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G3.gCv);
  G3.gT = now;
}
// עצים: אחד-שניים לכל משבצת יער באזור, בפיזור קבוע
function g3Trees() {
  if (G3.trees) return G3.trees;
  const fp = G3.fp, T = CFG.T, out = [];
  const x0 = Math.max(0, Math.floor(fp.x0 / T)), x1 = Math.min(W - 1, Math.ceil(fp.x1 / T)), y0 = Math.max(0, Math.floor(fp.y0 / T)), y1 = Math.min(H - 1, Math.ceil(fp.y1 / T));
  const near = new Set(); eachBuilding((b, j) => { const [bx, by] = XY(j), R = b.type === 'city' ? Math.ceil(townRad(b) / T) + 1 : 2; for (let y = by - R; y <= by + R; y++) for (let x = bx - R; x <= bx + R; x++) near.add(y * W + x); });
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x; if (S.terrain[i] !== FOREST || near.has(i)) continue;
    if (TERR.farm?.[i] && !(hash01(x, y, 391) < 0.55 && nb4(i).some(k => S.terrain[k] === FOREST && !TERR.farm[k]))) continue;   // שדות ביער: רק בשוליים נשארים עצים בודדים
    for (let k = 0; k < 2; k++) { const r = hash01(x, y, 300 + k); if (k && r < 0.4) continue; const wx = (x + hash01(x, y, 310 + k)) * T, wy = (y + hash01(x, y, 320 + k)) * T, s = 0.9 + hash01(x, y, 330 + k) * 0.7, g = 0.85 + hash01(y, x, 340 + k) * 0.3;
      out.push(wx, wy, g3H(wx, wy), r * 6.28, s * 1.15, g, g * (0.95 + r * 0.1), g); }
  }
  // גדרות חיות בין השדות: שיחים לאורך שוליים של שדות (אותם שדות שבתמונת הקרקע)
  const FS = 7, seed = S.seed, farmAt = (wx, wy) => { const tx = wx / T | 0, ty = wy / T | 0; return tx >= 0 && ty >= 0 && tx < W && ty < H && TERR.farm?.[ty * W + tx]; };
  const hedges = [];
  for (let cy = Math.floor(fp.y0 / FS); cy <= Math.ceil(fp.y1 / FS) && hedges.length < 200000; cy++) for (let cx = Math.floor(fp.x0 / FS); cx <= Math.ceil(fp.x1 / FS); cx++) {
    const sx = hash01(cx, cy, seed + 61) < 0.5, fx = sx ? Math.floor(cx / 2) : cx, fy = sx ? cy : Math.floor(cy / 2), X0 = sx ? fx * FS * 2 : fx * FS, Y0 = sx ? fy * FS : fy * FS * 2;
    if (X0 !== cx * FS || Y0 !== cy * FS || hash01(fx, fy, seed + 66) >= 0.35) continue;
    const w = sx ? FS * 2 : FS, h = sx ? FS : FS * 2;
    for (const [ax, ay, bx, by] of [[X0, Y0, X0 + w, Y0], [X0, Y0, X0, Y0 + h]]) { const L = Math.hypot(bx - ax, by - ay); for (let d = 0.6; d < L; d += 1.5 + hash01(cx * 7 + d * 10 | 0, cy, 360) * 0.8) { const wx = ax + (bx - ax) * d / L + (hash01(cx, cy * 3 + d | 0, 361) - 0.5) * 0.4, wy = ay + (by - ay) * d / L; if (!farmAt(wx, wy) || hash01(cx * 13 + d * 7 | 0, cy * 5, 364) < 0.3) continue; const g = 0.85 + hash01(cx + d | 0, cy, 362) * 0.3; hedges.push(wx, wy, g3H(wx, wy), d, 0.55 + hash01(cy, cx + d | 0, 363) * 0.35, g, g, g); } }
  }
  G3.hedges = new Float32Array(hedges);
  // סלעים בגבעות, בהרים ובחוף — אותן נקודות שהחיילים תופסים כמחסה (soldiers.js)
  const rocks = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = S.terrain[y * W + x]; if (t !== HILLS && t !== MOUNT && t !== SAND) continue;
    for (let k = 0; k < 2; k++) if (hash01(x, y, 370 + k) < (t === SAND ? 0.12 : 0.45)) { const wx = (x + 0.15 + hash01(x, y, 371 + k) * 0.7) * T, wy = (y + 0.15 + hash01(x, y, 373 + k) * 0.7) * T, s = 0.8 + hash01(x, y, 375 + k) * 0.6; rocks.push(wx, wy, g3H(wx, wy), hash01(x, y, 377 + k) * 6.28, s, 1, 1, 1); } }
  G3.rocks = new Float32Array(rocks);
  // דקלים: בחוף ובשפלה של אזורים חמים (דרום, חוף ים תיכוני)
  const palms = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x, t = S.terrain[i]; if ((t !== SAND && t !== GRASS) || TERR.farm?.[i] || near.has(i) || hash01(x, y, 395) > (t === SAND ? 0.1 : 0.03)) continue;
    const cl = climateAt(idx(x - x % (2 * G), y - y % (2 * G))); if (cl !== 'arid' && cl !== 'med') continue;
    const wx = (x + hash01(x, y, 396)) * T, wy = (y + hash01(x, y, 397)) * T; palms.push(wx, wy, g3H(wx, wy), hash01(x, y, 398) * 6.28, 0.9 + hash01(x, y, 399) * 0.4, 1, 1, 1); }
  G3.palms = new Float32Array(palms);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { const i = y * W + x; if (S.terrain[i] !== GRASS || TERR.farm?.[i] || near.has(i) || hash01(x, y, 350) > 0.035) continue; const wx = (x + 0.5) * T, wy = (y + 0.5) * T; out.push(wx, wy, g3H(wx, wy), 0, 0.9, 1, 1, 1); }
  return G3.trees = new Float32Array(out);
}

/* ---- ציור ---- */
function g3DrawModel(P, mdl, inst, count, M) {
  const gl = G3.gl; gl.bindVertexArray(mdl.vao);
  if (inst) { gl.bindBuffer(gl.ARRAY_BUFFER, G3.instBuf); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW); gl.uniform1f(P.u.uInst, 1); gl.drawArraysInstanced(gl.TRIANGLES, 0, mdl.n, count); }
  else { gl.uniform1f(P.u.uInst, 0); gl.uniform4fv(P.u.uM, M); gl.drawArrays(gl.TRIANGLES, 0, mdl.n); }
}
// רשימת כל מה שמצויר בסצנה (פעם אחת לצללים ופעם לתמונה)
function g3Scene(now) {
  const T = CFG.T, fp = G3.fp, items = [], inF = (x, y, m = 30) => x > fp.x0 - m && x < fp.x1 + m && y > fp.y0 - m && y < fp.y1 + m;
  eachBuilding((b, i) => {
    const [x, y] = XY(i), wx = x * T + T / 2, wy = y * T + T / 2; if (!inF(wx, wy)) return;
    const sc = done(b) ? 1 : 0.25 + 0.75 * (b.prog || 0);
    items.push({ mdl: b.type === 'city' ? townModel(i, done(b) ? b : { ...b, lvl: 1 }) : buildingModel(b), M: [wx, wy, g3H(wx, wy), 0], sc });
  });
  for (const mn of S.minors || []) { if (!mn.alive) continue; const [x, y] = XY(mn.town), wx = x * T + T / 2, wy = y * T + T / 2; if (!inF(wx, wy)) continue; items.push({ mdl: villageModel(mn.id), M: [wx, wy, g3H(wx, wy), 0], sc: 1 }); }
  // יחידות לפי סוג ואומה
  const groups = new Map(), add = (t, n, x, y, ang, s, alt = 0, abs) => { const k = t + ':' + n; let g = groups.get(k); if (!g) groups.set(k, g = { t, n, a: [] }); const c = rgb(S.nations[n].color); g.a.push(x, y, abs ? alt : g3H(x, y) + alt, ang, s, c[0] * 0.75 + 0.2, c[1] * 0.75 + 0.2, c[2] * 0.75 + 0.2); };
  for (const f of S.fronts) {
    const X = f.pos[0] * T + T / 2, Y = f.pos[1] * T + T / 2; if (!inF(X, Y, 60) || !unitCount(f.units)) continue;
    if (f.kind === 'navy') { const a = f.path ? (() => { const [nx, ny] = pathPos(f.path, Math.min(f.path.total, (f.pathT || 0) + 0.3)); return Math.atan2(ny - f.pos[1], nx - f.pos[0]); })() : now / 9000; for (let k = 0; k < Math.min(4, 1 + (unitCount(f.units) / 4 | 0)); k++) add('ship', f.n, X - Math.cos(a) * k * 9 + Math.sin(a) * (k % 2 ? 4 : -4) * (k ? 1 : 0), Y - Math.sin(a) * k * 9, a, 1.2, 0.1, true); continue; }
    if (f.flying) { const [nx, ny] = f.path ? pathPos(f.path, Math.min(f.path.total, f.pathT + 0.3)) : f.pos; add('plane', f.n, X, Y, Math.atan2(ny - f.pos[1], nx - f.pos[0]), 1.6, 22); continue; }
    if (f.kind !== 'land') continue;
    // מטוסים חגים מעל קרב, ומסוק תומך
    if (f.engaged && f.units.plane) { const n = Math.min(3, Math.ceil(f.units.plane / 3)); for (let k = 0; k < n; k++) { const a = now / 1000 * 0.5 + k * 6.283 / n; add('plane', f.n, X + Math.cos(a) * 26, Y + Math.sin(a) * 26, a + Math.PI / 2, 1.3, 30 + k * 3); } }
    if ((f.engaged && f.units.cmdo) || f.airborne) { const bx = X + 9, by = Y - 7 + Math.sin(now / 700) * 1.5, alt = 13 + Math.sin(now / 500) * 0.6, a = Math.atan2(Y - by, X - bx); add('heli', f.n, bx, by, a, 1.3, alt); add('rotor', f.n, bx, by, now / 40, 1.3, alt + 1.5 * 1.3); }
    updateUnits(f, X, Y, view.fdt || 0, now);
    const v = VIS.get(f.id); if (!v) continue;
    for (const u of v.units) {
      if (u.mount) add('truck', f.n, u.x, u.y, u.ang, 0.9);
      else if ((u.t === 'inf' || u.t === 'cmdo') && u.sq) { for (const s of u.sq.m) if (s.st !== 'gone') add(s.st === 'dead' ? 'body' : sModel(s, u.t), f.n, s.x, s.y, s.ang + (s.st === 'down' ? 1.2 : 0), 1.3, s.st === 'run' ? Math.abs(Math.sin(now / 95 + s.k * 1.7)) * 0.3 : 0); }
      else if (u.t === 'inf' || u.t === 'cmdo') for (let k = 0; k < 3; k++) { const a = u.ang + Math.PI / 2, ox = Math.cos(a) * (k - 1) * 1.3 - Math.cos(u.ang) * (k === 1 ? 0.9 : 0), oy = Math.sin(a) * (k - 1) * 1.3 - Math.sin(u.ang) * (k === 1 ? 0.9 : 0); add(u.t, f.n, u.x + ox * 1.3, u.y + oy * 1.3, u.ang, 1.15); }
      else add(u.t, f.n, u.x, u.y, u.ang, u.t === 'htank' ? 1.3 : 1.15);
    }
  }
  for (const c of S.convoys) { const [x, y] = pathPos(c.path, c.t), wx = x * T + T / 2, wy = y * T + T / 2; if (!inF(wx, wy)) continue; const [nx, ny] = pathPos(c.path, Math.min(c.path.total, c.t + 0.3)), a = Math.atan2(ny - y, nx - x);
    if (c.mode === 'air') add('plane', c.n, wx, wy, a, 1.4, 18); else if (isWater(tileOf(x, y))) add('ship', c.n, wx, wy, a, 0.9, 0.1, true); else add('truck', c.n, wx, wy, a, 0.8); }
  for (const c of TRADE.caravans || []) for (let k = 0; k < c.cars; k++) { const t = clamp(c.t - c.dir * k * 1.1 * ROAD_COST, 0, c.path.total), [x, y] = pathPos(c.path, t), wx = x * T + T / 2, wy = y * T + T / 2; if (!inF(wx, wy) || fogHide(c.n, x, y)) continue; const [x2, y2] = pathPos(c.path, clamp(t + c.dir * 0.5 * ROAD_COST, 0, c.path.total)), [x1, y1] = pathPos(c.path, clamp(t - c.dir * 0.5 * ROAD_COST, 0, c.path.total)); add('cargo', c.n, wx, wy, Math.atan2(y2 - y1, x2 - x1), 0.9); }
  for (const s of TRADE.ships || []) { const [x, y] = pathPos(s.path, s.t), wx = x * T + T / 2, wy = y * T + T / 2; if (!inF(wx, wy) || fogHide(s.n, x, y)) continue; const [x2, y2] = pathPos(s.path, clamp(s.t + s.dir * 0.4, 0, s.path.total)); add('ship', s.n, wx, wy, Math.atan2(y2 - y, x2 - x), s.len / 9, 0.1, true); }
  for (const r of S.rails) { const g = railGeo(r), dir = r.dir || 1; for (let k = 0; k < 5; k++) { const t = r.t - dir * k * WAGON_GAP; if (t < 0 || t > g.total) continue; const [x, y] = geoPos(g, t), wx = x * T, wy = y * T; if (!inF(wx, wy)) continue; const [x2, y2] = geoPos(g, t + 0.25), [x1, y1] = geoPos(g, t - 0.25); add(k ? 'wagon' : 'loco', r.n, wx, wy, Math.atan2(y2 - y1, x2 - x1) + (dir < 0 ? Math.PI : 0), 1, 0.3); } }
  eachBuilding((b, i) => { if (b.type !== 'airport' || !done(b)) return; const [x, y] = XY(i), wx = x * T + T / 2, wy = y * T + T / 2; if (!inF(wx, wy)) return; add('plane', b.n, wx - 1.8, wy + 7.4, -Math.PI / 2, 1, 0.9); add('plane', b.n, wx + 6, wy - 1.6, 0, 0.95, 0.9); });
  for (const d of S.divs) { const g = d.gar; if (!g) continue; const X = g.pos[0] * T, Y = g.pos[1] * T; if (!inF(X, Y) || (fogOn() && d.n !== 0 && fogHide(d.n, g.pos[0], g.pos[1]))) continue; if (!g.arr) { const h = g.hd || 0; for (let k = 0; k < 3; k++) add('truck', d.n, X - Math.cos(h) * k * 4.4, Y - Math.sin(h) * k * 4.4, h, 0.8); continue; } const h = g.h || 0; for (let k = 0; k < 4; k++) add('infK', d.n, X + Math.cos(h + 1.57) * (k - 1.5) * 1.7, Y + Math.sin(h + 1.57) * (k - 1.5) * 1.7, h, 1.3); }   // חיל משמר
  for (const b of BODIES) { if (!inF(b.x, b.y)) continue; b.t += view.fdt || 0; if (b.t > 30) continue; add('body', b.n, b.x, b.y, b.ang, 1.3); }
  for (const w of WRECKS) if (w.tank) { const k = 'wreck:x'; let g = groups.get(k); if (!g) groups.set(k, g = { t: 'wreck', n: -1, a: [] }); g.a.push(w.x, w.y, g3H(w.x, w.y), w.ang || 0, 0.8, 1, 1, 1); }
  return { items, groups };
}
function draw3D(now, fdt) {
  const gl = G3.gl, dpr = devicePixelRatio || 1, Wd = innerWidth * dpr | 0, Hd = innerHeight * dpr | 0;
  view.fdt = fdt;
  if (TRADE.last != null && TRADE.s === S) updateTrade(vTime() - TRADE.last); else { TRADE.ships = []; TRADE.caravans = []; } TRADE.last = vTime(); TRADE.s = S;
  if (glCv.width !== Wd || glCv.height !== Hd) { glCv.width = Wd; glCv.height = Hd; }
  g3Footprint();
  const fp0 = G3.fp, inFp = j => { const x = (j % W) * CFG.T, y = ((j / W) | 0) * CFG.T; return x > fp0.x0 - 16 && x < fp0.x1 + 16 && y > fp0.y0 - 16 && y < fp0.y1 + 16; };
  if (G3.ownGen !== OWNLOG.gen) { G3.ownGen = OWNLOG.gen; G3.ownI = 0; G3.ownCh = (G3.ownCh || 0) + 1; }
  for (let q = G3.ownI || 0; q < OWNLOG.a.length; q++) if (inFp(OWNLOG.a[q])) G3.ownCh = (G3.ownCh || 0) + 1; G3.ownI = OWNLOG.a.length;
  // רק גנרלים שאזור הקרב שלהם על המסך משפיעים על החתימה
  const zs = S.fronts.reduce((a, f) => a + (f.zone?.length && inFp(f.zone[0]) ? f.zone[0] + f.zone.length * 7 + Math.round(Object.values(f.prog || {}).reduce((x, y) => x + y, 0) * 3) : 0), 0);
  const sig = [G3.ownCh, DECALS.length, TRACKS.length >> 4, (S.worksV || 0) + (S.works || []).reduce((a, w) => a + Math.round(w.lvl * 3) + (w.wire >= 1 ? 1 : 0), 0), ui.sel, ui.pick?.kind, view.hintSrc?.size, zs, S.ops.reduce((a, o) => a + o.objectives.length, 0), TERR.cityKey?.length, view.railDirty, fogOn() ? FOG.ver : 0, MM.mode, MM.ver].join('|');
  if (G3.gT === 0 || (sig !== G3.gSig && now - G3.gT > 900) || now - G3.gT > 6000) { G3.gSig = sig; g3GroundTexture(now); }
  const sun = sunState(), VP = camMatrix(), LVP = lightMatrix(sun, G3.fp), sc = g3Scene(now), trees = g3Trees(), lines = g3Fx(fdt, now), PL = g3Lights(sun);
  const passes = [['sh', G3.sh], ['lit', G3.lit]];
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  for (const [kind, P] of passes) {
    gl.useProgram(P.p);
    if (kind === 'sh') { gl.bindFramebuffer(gl.FRAMEBUFFER, G3.shadow.fb); gl.viewport(0, 0, G3.shadow.SZ, G3.shadow.SZ); gl.clear(gl.DEPTH_BUFFER_BIT); gl.uniformMatrix4fv(P.u.uLVP, false, LVP); }
    else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, Wd, Hd); gl.clearColor(0.04, 0.06, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniformMatrix4fv(P.u.uLVP, false, LVP);
      gl.uniform3fv(P.u.uSun, sun.dir); gl.uniform3fv(P.u.uSunCol, sun.sunCol); gl.uniform3fv(P.u.uAmb, sun.amb); gl.uniform1f(P.u.uNight, sun.night); gl.uniform1f(P.u.uShOn, 1); gl.uniform1f(P.u.uTime, now / 1000);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G3.shadow.tex); gl.uniform1i(P.u.uSh, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G3.gTex); gl.uniform1i(P.u.uTex, 1);
      gl.uniform1i(P.u.uNPL, PL.length); gl.uniform1f(P.u.uEmit, 0); if (PL.length) { gl.uniform4fv(P.u['uPL[0]'], PL.flatMap(l => [l[0], l[1], l[2], l[3]])); gl.uniform3fv(P.u['uPLC[0]'], PL.flatMap(l => l[4])); }
      if (G3.farmVer !== TERR.farmVer || G3.farmS !== S) { G3.farmVer = TERR.farmVer; G3.farmS = S; const a = new Uint8Array(W * H); for (let i = 0; i < a.length; i++) a[i] = TERR.farm[i] ? 255 : 0; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G3.farmTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, a); G3.trees = null; }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G3.farmTex); gl.uniform1i(P.u.uFarm, 2); gl.uniform1f(P.u.uT, CFG.T); gl.uniform1f(P.u.uFS, 7); gl.uniform1i(P.u.uSeed, S.seed | 0);
      gl.uniform2f(P.u.uUV0, G3.fp.x0, G3.fp.y0); gl.uniform2f(P.u.uUVS, G3.fp.x1 - G3.fp.x0, G3.fp.y1 - G3.fp.y0);
    }
    // קרקע
    if (kind === 'lit') gl.uniform1f(P.u.uGround, 1);
    gl.uniform1f(P.u.uInst, 0); gl.uniform4fv(P.u.uM, [0, 0, 0, 0]);
    gl.bindVertexArray(G3.mesh.vao); gl.drawElements(gl.TRIANGLES, G3.mesh.n, gl.UNSIGNED_INT, 0);
    if (kind === 'lit') gl.uniform1f(P.u.uGround, 0);
    // מבנים וערים (קנה מידה אנכי לבנייה בתהליך — דרך מופע יחיד)
    for (const it of sc.items) { if (it.sc < 1) { g3DrawModel(P, it.mdl, new Float32Array([...it.M, it.sc, 1, 1, 1]), 1); } else g3DrawModel(P, it.mdl, null, 0, it.M); }
    if (trees.length) { g3DrawModel(P, unitModel('tree'), trees, trees.length / 8); }
    if (G3.hedges?.length) g3DrawModel(P, unitModel('bush'), G3.hedges, G3.hedges.length / 8);
    if (G3.rocks?.length) g3DrawModel(P, unitModel('rock'), G3.rocks, G3.rocks.length / 8);
    if (G3.palms?.length) g3DrawModel(P, unitModel('palm'), G3.palms, G3.palms.length / 8);
    for (const g of sc.groups.values()) g3DrawModel(P, unitModel(g.t), new Float32Array(g.a), g.a.length / 8);
  }
  g3DrawParticles(VP, lines);
  gl.bindVertexArray(null);
}

/* ---- שכבת-על על הקנבס הדו-ממדי ---- */
// מציב את הקנבס כך ששרטוט בקואורדינטות עולם נופל על מישור הקרקע (גובה 0)
function g3GroundXf() {
  const dpr = devicePixelRatio || 1, z = view.cam.zoom * dpr, [cx, cy] = g3C();
  ctx.setTransform(z, 0, 0, z * G3.cos, innerWidth * dpr / 2 - cx * z, innerHeight * dpr / 2 - cy * z * G3.cos);
}
// מציב את הקנבס לשרטוט זקוף (טקסט/סמלים) סביב נקודת עולם בגובה h מעל הקרקע
function g3Upright(wx, wy, lift = 0) {
  const dpr = devicePixelRatio || 1, z = view.cam.zoom * dpr, [sx, sy] = g3P(wx, wy, g3H(wx, wy) + lift);
  ctx.setTransform(z, 0, 0, z, sx * dpr - wx * z, sy * dpr - wy * z);
}
function drawOverlay3(now, fdt) {
  const T = CFG.T, cam = view.cam, dpr = devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  view.lk = clamp(2.6 / cam.zoom, 0.4, 1);
  const fp = G3.fp, inVis = (x, y, m = 24) => x > fp.x0 - m && x < fp.x1 + m && y > fp.y0 - m && y < fp.y1 + m;
  g3GroundXf();
  // דברים שזזים על הקרקע
  for (const f of S.fronts) {
    if (f.n !== 0 || !f.path || !(f.id === ui.selFront || cam.zoom > 1)) continue;
    ctx.strokeStyle = f.id === ui.selFront ? 'rgba(95,224,255,.9)' : 'rgba(95,224,255,.45)'; ctx.lineWidth = 0.8; ctx.setLineDash([2, 1.5]); ctx.beginPath(); ctx.moveTo(f.pos[0] * T + T / 2, f.pos[1] * T + T / 2);
    const c = f.path.cum; for (let k = 0; k < f.path.tiles.length; k++) if (c[k] > f.pathT) { const [x, y] = XY(f.path.tiles[k]); ctx.lineTo(x * T + T / 2, y * T + T / 2); } ctx.stroke(); ctx.setLineDash([]);
    if (f.id === ui.selFront) { const t = f.path.tiles[f.path.tiles.length - 1], [x, y] = XY(t); g3Upright(x * T + T / 2, y * T + T / 2, 3); drawETA(f); g3GroundXf(); }
  }
  runDelayed(fdt);
  drawEncirclements(now, inVis); drawAxes(now);
  // מעברי הרים: תווית זקופה
  minorLabels((wx, wy) => { if (!inVis(wx, wy, 40)) return false; g3Upright(wx, wy, 5); return true; });
  featLabels((wx, wy) => { if (!inVis(wx, wy, 30)) return false; g3Upright(wx, wy, 4); return true; });
  // זקוף: סמלי מבנים ותוויות ערים
  eachBuilding((b, i) => {
    const [x, y] = XY(i), wx = x * T + T / 2, wy = y * T + T / 2; if (!inVis(wx, wy, 40)) return;
    if (b.type === 'city') { if (!done(b) || (!b.capital && cam.zoom < 0.9)) return; g3Upright(wx, wy + townRad(b) * 0.85, 0); drawLabel(wx, wy + townRad(b) * 0.85, cityName(i, b), b.capital ? 'בירה' : (cam.zoom >= 2 ? 'רמה ' + (b.lvl || 1) : null), S.nations[b.n].color); return; }
    if (done(b) && cam.zoom <= 3.2) { g3Upright(wx, wy, 6); drawBadge(b, wx, wy, BSZ); }
    if (!done(b) || b.upg != null) { const p = done(b) ? b.upg : b.prog; g3Upright(wx, wy, 2); ctx.fillStyle = '#0c1018'; ctx.fillRect(wx - 7, wy + 5, 14, 2.5); ctx.fillStyle = '#5fe0ff'; ctx.fillRect(wx - 6.5, wy + 5.5, 13 * p, 1.5); }
  });
  // גנרלים: סמל, שם ומורל מעל הכוח
  ctx.textAlign = 'center';
  for (const f of S.fronts) {
    const col = S.nations[f.n].color, cnt = unitCount(f.units), sel = f.n === 0 && f.id === ui.selFront, X = f.pos[0] * T + T / 2, Y = f.pos[1] * T + T / 2;
    if (!inVis(X, Y, 60)) continue;
    const type = f.kind === 'navy' ? 'ship' : f.flying ? 'plane' : mainType(f.units), strip = f.kind === 'navy' ? '#5fe0ff' : f.role === 'defend' ? (f.defRole === 'reserve' ? '#3fb8a0' : '#7ad07a') : f.solo ? '#ff7ad8' : f.opRole === 'ME' ? '#ff9a3c' : f.opRole === 'EXP' ? '#ff5ab4' : '#ffd84a';
    if (cam.zoom >= 0.9 && cnt && !f.flying) drawDivMarks(f, X, Y, view.lk * 0.8, (wx, wy) => g3Upright(wx, wy, 6));
    g3Upright(X, Y, f.flying ? 14 : 9); const k = view.lk; ctx.save(); ctx.translate(X, Y); ctx.scale(k, k);
    drawCounter(-7, -9, 14, 8, col, type, cnt || null, { sel, hot: f.engaged, strip, dim: !cnt });
    if (f.kind === 'land' && cnt) { const o = f.org ?? 1; ctx.fillStyle = 'rgba(12,16,24,.85)'; ctx.fillRect(-7, -0.6, 14, 1.2); ctx.fillStyle = o > 0.6 ? '#5ad07a' : o > 0.3 ? '#e8b820' : '#e04848'; ctx.fillRect(-7, -0.6, 14 * o, 1.2); }
    if (sel || cam.zoom >= 1.6) drawLabel_(0, -16, f.gen.name, null, col);
    ctx.restore(); drawStatusMarks(f, X + 7 * k, Y - 9 * k, k);
  }
  g3GroundXf(); drawBattles(inVis, now); drawFloats(fdt);
  if ((now / 1000 | 0) % 5 === 0) pruneVis();
}

/* ===================== אפקטים בתלת-ממד: חלקיקים, נותבים, אורות, כתמי קרב ===================== */
const PARTS = [], LIGHTS3 = [], DECALS = [], RND = Math.random;
const part = o => { if (PARTS.length < 3000) PARTS.push(Object.assign({ vx: 0, vy: 0, vz: 0, t: 0, g: 0, drag: 0, add: 0 }, o)); };
const SMOKE = (a = 0.55) => [[0.22, 0.21, 0.2, a], [0.42, 0.41, 0.4, 0]];
function g3Boom(x, y, big) {
  const h = g3H(x, y), r = big ? 8 : 4;
  part({ x, y, z: h + r * 0.5, life: 0.16, s0: r * 2.6, s1: r * 4, c0: [1, 0.96, 0.82, 1], c1: [1, 0.7, 0.3, 0], add: 1 });
  for (let k = 0; k < (big ? 12 : 5); k++) { const a = RND() * 6.28, d = RND() * r * 0.6; part({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: h + 0.6, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 5 + RND() * 9, drag: 2.2, life: 0.55 + RND() * 0.5, s0: r * (1.1 + RND() * 0.5), s1: r * 2.1, c0: [1, 0.78 + RND() * 0.15, 0.35, 1], c1: [0.55, 0.12, 0.04, 0], add: 1 }); }
  for (let k = 0; k < (big ? 14 : 5); k++) { const a = RND() * 6.28, d = RND() * r * 0.7, [c0, c1] = SMOKE(0.5 + RND() * 0.2); part({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: h + 1, vx: Math.cos(a) * 1.5 + 1.2, vy: Math.sin(a) * 1.5, vz: 3 + RND() * 5, drag: 0.6, life: 2.2 + RND() * 2.5, s0: r * 0.7, s1: r * (2.4 + RND()), c0, c1 }); }
  for (let k = 0; k < (big ? 10 : 4); k++) { const a = RND() * 6.28; part({ x, y, z: h + 1, vx: Math.cos(a) * (6 + RND() * 10), vy: Math.sin(a) * (6 + RND() * 10), vz: 8 + RND() * 14, g: -32, life: 0.5 + RND() * 0.5, s0: 0.7, s1: 0.4, c0: [1, 0.85, 0.5, 1], c1: [1, 0.4, 0.1, 0], add: 1 }); }
  LIGHTS3.push({ x, y, z: h + 5, r: r * 7, c: [2.2, 1.3, 0.55], t: 0, life: big ? 0.9 : 0.45 });
  if (big) {   // פיצוץ גדול (סבב גרפיקה 1): כדור אש שעולה, עמוד עשן כהה גבוה, טבעת אבק על הקרקע, רסיסים כבדים
    for (let k = 0; k < 6; k++) part({ x: x + (RND() - 0.5) * 2, y: y + (RND() - 0.5) * 2, z: h + 2 + k * 1.2, vz: 4 + k * 1.5, drag: 0.8, life: 0.7 + k * 0.12, s0: r * (1.6 - k * 0.12), s1: r * 2.4, c0: [1, 0.62 - k * 0.06, 0.18, 0.95], c1: [0.35, 0.12, 0.05, 0], add: 1 });
    for (let k = 0; k < 8; k++) { const [c0, c1] = SMOKE(0.75); part({ x: x + (RND() - 0.5) * 3, y: y + (RND() - 0.5) * 3, z: h + 4 + k * 2, vx: 0.8, vz: 3 + RND() * 3, drag: 0.25, life: 4 + RND() * 3, s0: r * 0.9, s1: r * (2.6 + RND()), c0: [0.12, 0.11, 0.1, 0.8], c1 }); }
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.28 + RND() * 0.3, v = 10 + RND() * 6; part({ x, y, z: h + 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 0.6, drag: 2.6, life: 1.6 + RND(), s0: 1.5, s1: r * 1.2, c0: [0.66, 0.56, 0.4, 0.55], c1: [0.7, 0.62, 0.48, 0] }); }
    for (let k = 0; k < 10; k++) { const a = RND() * 6.28, v = 4 + RND() * 9; part({ x, y, z: h + 1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 10 + RND() * 12, g: -30, life: 0.9 + RND() * 0.6, s0: 0.9, s1: 0.8, c0: [0.16, 0.13, 0.1, 1], c1: [0.2, 0.17, 0.13, 1] }); }
  }
  if (big || RND() < 0.35) { DECALS.push({ x, y, r: r * (0.8 + RND() * 0.5), a: RND() * 6.28 }); if (DECALS.length > 500) DECALS.shift(); }
}
// פיצוצים: בתלת-ממד — חלקיקים; בדו-ממד — כמו קודם
const spawnBoom2D = spawnBoom;
spawnBoom = function (x, y, big) { if (G3.on) g3Boom(x, y, big); else spawnBoom2D(x, y, big); };
function g3Fx(dt, now) {
  const T = CFG.T, fp = G3.fp, lines = [];
  // יריות: הבזקי לוע, נותבים, פגזים בקשת
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const s = SHOTS[i]; s.t += dt; const k = s.t / s.life, h1 = g3H(s.x1, s.y1), h2 = g3H(s.x2, s.y2);
    if (!s.seen && (s.kind === 'cannon' || (s.kind === 'shell' && !s.small))) { const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1); for (let q = 0; q < 3; q++) part({ x: s.x1 + Math.cos(a) * (2 + q), y: s.y1 + Math.sin(a) * (2 + q), z: h1 + 2, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, vz: 1, drag: 1.2, life: 1.2 + q * 0.3, s0: 1.2, s1: 3.5, c0: [0.78, 0.76, 0.72, 0.55], c1: [0.8, 0.8, 0.78, 0] }); }
    if (!s.seen) { s.seen = 1; const big = s.kind === 'cannon' || s.kind === 'shell'; part({ x: s.x1, y: s.y1, z: h1 + (big ? 2 : 1.6), life: big ? 0.09 : 0.05, s0: big ? 3 : 1.2, s1: big ? 4 : 1.6, c0: [1, 0.92, 0.6, 1], c1: [1, 0.6, 0.2, 0], add: 1 }); if (big) { const [c0, c1] = SMOKE(0.35); part({ x: s.x1, y: s.y1, z: h1 + 2, vz: 1.5, life: 1.2, s0: 1.5, s1: 4, c0, c1 }); } }
    if (k >= 1) { SHOTS.splice(i, 1);
      if (s.kind === 'shell') spawnBoom(s.x2, s.y2, !s.small); else if (s.kind === 'cannon' && RND() < 0.6) spawnBoom(s.x2, s.y2, false);
      else if (RND() < 0.25) part({ x: s.x2, y: s.y2, z: h2 + 0.3, vz: 1.5, life: 0.5, s0: 0.6, s1: 1.8, c0: [0.45, 0.38, 0.28, 0.6], c1: [0.5, 0.45, 0.35, 0] });
      continue; }
    if (s.kind === 'shell') { const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), x = s.x1 + (s.x2 - s.x1) * k, y = s.y1 + (s.y2 - s.y1) * k, z = h1 + (h2 - h1) * k + 2 + Math.sin(k * Math.PI) * L * 0.3;
      part({ x, y, z, life: 0.05, s0: 0.9, s1: 0.9, c0: [1, 0.85, 0.55, 1], c1: [1, 0.6, 0.3, 1], add: 1 }); if (RND() < 0.5) part({ x, y, z, life: 0.6, s0: 0.5, s1: 1.4, c0: [0.7, 0.7, 0.68, 0.25], c1: [0.7, 0.7, 0.7, 0] }); continue; }
    const a = Math.max(0, k - 0.3), b = Math.min(1, k + 0.3), z0 = s.kind === 'cannon' ? 1.9 : 1.6, col = s.kind === 'cannon' ? [1, 0.75, 0.4, 1] : s.kind === 'flak' ? [1, 0.95, 0.7, 0.9] : [1, 0.82, 0.45, 0.85];
    lines.push(s.x1 + (s.x2 - s.x1) * a, s.y1 + (s.y2 - s.y1) * a, h1 + (h2 - h1) * a + z0, 0, ...col, s.x1 + (s.x2 - s.x1) * b, s.y1 + (s.y2 - s.y1) * b, h1 + (h2 - h1) * b + z0, 0, ...col);
  }
  // הריסות בוערות
  for (let i = WRECKS.length - 1; i >= 0; i--) { const w = WRECKS[i]; w.t += dt; if (w.t > 14) { WRECKS.splice(i, 1); continue; }
    if (w.tank && w.t < 10 && RND() < dt * 5) { const h = g3H(w.x, w.y), [c0, c1] = SMOKE(0.5); part({ x: w.x, y: w.y, z: h + 1.5, vx: 1, vz: 3 + RND() * 2, drag: 0.3, life: 2.5, s0: 1.2, s1: 4.5, c0, c1 }); if (w.t < 5 && RND() < 0.5) part({ x: w.x + (RND() - 0.5), y: w.y, z: h + 1.4, vz: 2, life: 0.35, s0: 1.2, s1: 1.8, c0: [1, 0.6, 0.2, 0.9], c1: [0.6, 0.1, 0, 0], add: 1 }); } }
  // קו מגע: עשן ואש מעל משבצות הקרב
  for (const f of S.fronts) {
    if (f.kind !== 'land' || !f.engaged || !f.zone?.length || f.retreating) continue;
    const [px, py] = f.pos; if (px * T < fp.x0 - 40 || px * T > fp.x1 + 40 || py * T < fp.y0 - 40 || py * T > fp.y1 + 40) continue;
    for (const j of f.zone.slice(0, 24)) { const [x, y] = XY(j), wx = (x + RND()) * T, wy = (y + RND()) * T;
      if (RND() < dt * 0.35) { const h = g3H(wx, wy), [c0, c1] = SMOKE(0.35); part({ x: wx, y: wy, z: h + 1, vx: 1.2, vz: 2 + RND() * 2, drag: 0.4, life: 3 + RND() * 2, s0: 3, s1: 9, c0, c1 }); }
      if (RND() < dt * 0.25) { const h = g3H(wx, wy); part({ x: wx, y: wy, z: h + 0.8, vz: 1.5, life: 0.6, s0: 1.4, s1: 2.4, c0: [1, 0.6, 0.2, 0.85], c1: [0.6, 0.1, 0, 0], add: 1 }); if (RND() < 0.3) LIGHTS3.push({ x: wx, y: wy, z: h + 3, r: 14, c: [1.2, 0.6, 0.25], t: 0, life: 0.5 }); } }
  }
  // עשן מארובות המפעלים
  eachBuilding((b, i) => { if (b.type !== 'factory' || !done(b)) return; const [x, y] = XY(i), cx = x * T + T / 2, cy = y * T + T / 2; if (cx < fp.x0 || cx > fp.x1 || cy < fp.y0 || cy > fp.y1) return;
    for (const dx of [5.1, 7.4]) if (RND() < dt * 2.5) { const h = g3H(cx, cy); part({ x: cx + dx, y: cy + 0.8, z: h + 9.2, vx: 1.6, vz: 2.2, drag: 0.2, life: 3.5, s0: 1.2, s1: 5, c0: [0.38, 0.37, 0.36, 0.5], c1: [0.6, 0.6, 0.6, 0] }); } });
  // עשן קטר
  for (const r of S.rails) { if (RND() > dt * 4) continue; const [x, y] = geoPos(railGeo(r), r.t), wx = x * T, wy = y * T; if (wx < fp.x0 || wx > fp.x1 || wy < fp.y0 || wy > fp.y1) continue; part({ x: wx, y: wy, z: g3H(wx, wy) + 3.6, vz: 2.5, vx: 0.8, drag: 0.4, life: 2, s0: 0.9, s1: 3.4, c0: [0.75, 0.75, 0.72, 0.45], c1: [0.8, 0.8, 0.8, 0] }); }
  // עדכון חלקיקים
  for (let i = PARTS.length - 1; i >= 0; i--) { const p = PARTS[i]; p.t += dt; if (p.t >= p.life) { PARTS.splice(i, 1); continue; }
    const dr = Math.max(0, 1 - p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz = p.vz * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
  for (let i = LIGHTS3.length - 1; i >= 0; i--) { const l = LIGHTS3[i]; l.t += dt; if (l.t >= l.life) LIGHTS3.splice(i, 1); }
  return lines;
}
// אורות לסצנה: פיצוצים + ערים בלילה, הקרובים למרכז המסך
function g3Lights(sun) {
  const T = CFG.T, [cx, cy] = g3C(), L = [];
  for (const l of LIGHTS3) { const k = 1 - l.t / l.life; L.push([l.x, l.y, l.z, l.r, l.c.map(v => v * k)]); }
  if (sun.night > 0.05) eachBuilding((b, i) => { if (b.type !== 'city' || !done(b)) return; const [x, y] = XY(i), wx = x * T + T / 2, wy = y * T + T / 2, r = townRad(b) * 1.7; L.push([wx, wy, g3H(wx, wy) + 6, r, [1, 0.62, 0.28].map(v => v * 1.6 * sun.night)]); });
  L.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  return L.slice(0, 24);
}
function g3DrawParticles(VP, lines) {
  const gl = G3.gl, P = G3.pp, dpr = devicePixelRatio || 1, al = [], ad = [];
  for (const p of PARTS) { const k = p.t / p.life, s = p.s0 + (p.s1 - p.s0) * k, c = p.c0.map((v, i) => v + (p.c1[i] - v) * k); (p.add ? ad : al).push(p.x, p.y, p.z, s, c[0], c[1], c[2], c[3]); }
  gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform1f(P.u.uPx, view.cam.zoom * dpr);
  gl.enable(gl.BLEND); gl.depthMask(false); gl.bindVertexArray(G3.pVao); gl.bindBuffer(gl.ARRAY_BUFFER, G3.pBuf);
  gl.uniform1f(P.u.uLine, 0);
  if (al.length) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(al), gl.DYNAMIC_DRAW); gl.drawArrays(gl.POINTS, 0, al.length / 8); }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  if (ad.length) { gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ad), gl.DYNAMIC_DRAW); gl.drawArrays(gl.POINTS, 0, ad.length / 8); }
  if (lines.length) { gl.uniform1f(P.u.uLine, 1); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW); gl.drawArrays(gl.LINES, 0, lines.length / 8); }
  gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
}
