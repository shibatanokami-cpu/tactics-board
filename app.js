'use strict';
/* 戦術ボード — 依存ライブラリなし。データは端末内(localStorage)にのみ保存。 */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));

const PW = 105, PH = 68;
const FONT = '-apple-system,"Hiragino Sans","Yu Gothic",sans-serif';
const VIEWS = {
  full:   { x0: -3, y0: -3, x1: 108, y1: 71, rot: false },
  att:    { x0: 50, y0: -3, x1: 108, y1: 71, rot: true },
  def:    { x0: -3, y0: -3, x1: 55,  y1: 71, rot: true },
  attBox: { x0: 70, y0: 6,  x1: 108, y1: 62, rot: true },
  defBox: { x0: -3, y0: 6,  x1: 35,  y1: 62, rot: true },
};
const PITCH = {
  grass: { bg: '#2e7d3a', stripe: '#2a7436', line: 'rgba(255,255,255,.92)', outline: '#ffffff', label: '#ffffff', labelBg: 'rgba(0,0,0,.5)' },
  dark:  { bg: '#12161d', stripe: null, line: '#6b7a90', outline: '#ffffff', label: '#e8edf5', labelBg: 'rgba(0,0,0,.55)' },
  white: { bg: '#fbfbf8', stripe: null, line: '#2b2b2b', outline: '#222222', label: '#111111', labelBg: 'rgba(255,255,255,.8)' },
};
const PENW = [0.35, 0.6, 1.0];
const PRESETS = {
  '11人制': ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '3-4-3', '3-5-2', '3-4-2-1', '5-3-2', '5-4-1'],
  '8人制': ['2-3-2', '3-3-1', '2-4-1', '3-2-2'],
  '7人制': ['2-3-1', '3-2-1'],
  '5人制': ['2-2', '1-2-1', '3-1'],
};

/* ---------- 保存 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('tb.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tb.' + k, JSON.stringify(v)); } catch { toast('保存できませんでした（容量不足の可能性）'); } },
};
let boards = store.get('boards', {});
const savedSettings = store.get('settings', {});
const settings = Object.assign({ theme: 'grass', showNames: true, size: 1, speed: 1 }, savedSettings);
settings.colors = Object.assign({ h: '#1e63d6', hg: '#f2c230', a: '#e23c3c', ag: '#8e44ad' }, savedSettings.colors);
let roster = store.get('roster', []);
const match = Object.assign({ half: 1, running: false, startAt: 0, elapsed: 0, h: 0, a: 0 }, store.get('match', {}));

let board = null;
let undoStack = [], redoStack = [];
let tool = 'select', penColor = '#ffffff', penW = 1, penArrow = true;
let selId = null, drawing = null, anim = null, recording = false;
const ptrs = new Map();

/* ---------- ボード ---------- */
function formationXY(lines) {
  const out = [[5, 34]], n = lines.length;
  lines.forEach((k, i) => {
    const x = n === 1 ? 30 : 15 + i * (31 / (n - 1));
    for (let j = 0; j < k; j++) out.push([r2(x), r2(PH * (j + 1) / (k + 1))]);
  });
  return out;
}
const mirror = ([x, y]) => [r2(PW - x), r2(PH - y)];
function parseFormation(str) {
  const lines = String(str).split(/[^0-9]+/).map(Number).filter(n => n > 0 && n <= 10);
  return lines.length && lines.length <= 6 ? lines : null;
}
function newBoard(name) {
  const b = { id: uid(), name, updated: Date.now(), pieces: [], frames: [{ pos: {}, draw: [] }], cur: 0, view: 'full' };
  const prev = board; board = b;
  applyFormation('h', '4-4-2'); applyFormation('a', '4-4-2');
  addPiece('b', { x: 52.5, y: 34 });
  board = prev;
  return b;
}
const curFrame = () => board.frames[board.cur];
const curPos = () => curFrame().pos;
const curDraw = () => curFrame().draw;
const team = t => board.pieces.filter(p => p.t === t);

function nextNum(t) {
  const used = new Set(team(t).map(p => String(p.num)));
  let n = 1; while (used.has(String(n))) n++;
  return String(n);
}
function addPiece(t, { x, y, pl } = {}) {
  const p = { id: uid(), t, num: t === 'b' ? '' : (pl ? pl.num : nextNum(t)), name: pl ? pl.name : '', pid: pl ? pl.id : null, gk: false };
  board.pieces.push(p);
  for (const f of board.frames) f.pos[p.id] = [r2(x), r2(y)];
  return p;
}
function deletePiece(id) {
  board.pieces = board.pieces.filter(p => p.id !== id);
  for (const f of board.frames) delete f.pos[id];
}
function applyFormation(t, str) {
  const lines = parseFormation(str); if (!lines) return false;
  let xy = formationXY(lines); if (t === 'a') xy = xy.map(mirror);
  let ps = team(t);
  while (ps.length < xy.length) { addPiece(t, { x: xy[ps.length][0], y: xy[ps.length][1] }); ps = team(t); }
  while (ps.length > xy.length) { deletePiece(ps[ps.length - 1].id); ps = team(t); }
  ps.forEach((p, i) => { p.gk = i === 0; curPos()[p.id] = xy[i]; });
  return true;
}
function assignPlayer(p, pl) { p.pid = pl.id; p.num = pl.num; p.name = pl.name; }
const benchPlayers = () => { const on = new Set(team('h').map(p => p.pid)); return roster.filter(pl => !on.has(pl.id)); };

/* ---------- 変更・保存・元に戻す ---------- */
function snap() { undoStack.push(JSON.stringify(board)); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
function undo() { if (!undoStack.length || anim) return; redoStack.push(JSON.stringify(board)); board = JSON.parse(undoStack.pop()); closePop(); changed(); }
function redo() { if (!redoStack.length || anim) return; undoStack.push(JSON.stringify(board)); board = JSON.parse(redoStack.pop()); closePop(); changed(); }
let saveTimer = 0;
function flushSave() { clearTimeout(saveTimer); saveTimer = 0; if (!board) return; boards[board.id] = board; store.set('boards', boards); store.set('current', board.id); }
function changed() {
  board.updated = Date.now();
  refreshUI(); requestRender();
  clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 300);
}
function openBoard(b) { flushSave(); board = b; undoStack = []; redoStack = []; selId = null; closePop(); store.set('current', b.id); refreshUI(); requestRender(); }

/* ---------- 座標変換 ---------- */
function layoutFor(W, H, key) {
  const v = VIEWS[key] || VIEWS.full;
  const vw = v.rot ? v.y1 - v.y0 : v.x1 - v.x0, vh = v.rot ? v.x1 - v.x0 : v.y1 - v.y0;
  const s = Math.min(W / vw, H / vh);
  return { v, s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2 };
}
const w2s = (L, x, y) => L.v.rot ? [L.ox + (y - L.v.y0) * L.s, L.oy + (L.v.x1 - x) * L.s] : [L.ox + (x - L.v.x0) * L.s, L.oy + (y - L.v.y0) * L.s];
const s2w = (L, px, py) => L.v.rot ? [L.v.x1 - (py - L.oy) / L.s, L.v.y0 + (px - L.ox) / L.s] : [L.v.x0 + (px - L.ox) / L.s, L.v.y0 + (py - L.oy) / L.s];
function applyWorld(ctx, L) {
  const { v, s, ox, oy } = L;
  if (v.rot) ctx.transform(0, -s, s, 0, ox - v.y0 * s, oy + v.x1 * s);
  else ctx.transform(s, 0, 0, s, ox - v.x0 * s, oy - v.y0 * s);
}
const pieceR = L => clamp(1.9 * L.s, 15, 28) * settings.size;
function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
const pieceColor = p => p.t === 'h' ? (p.gk ? settings.colors.hg : settings.colors.h) : (p.gk ? settings.colors.ag : settings.colors.a);

/* ---------- 描画 ---------- */
function drawPitch(ctx, L, P) {
  ctx.save(); applyWorld(ctx, L);
  if (P.stripe) { ctx.fillStyle = P.stripe; for (let i = 0; i < 14; i += 2) ctx.fillRect(i * 7.5, 0, 7.5, PH); }
  ctx.strokeStyle = P.line; ctx.fillStyle = P.line; ctx.lineWidth = Math.max(1.6 / L.s, 0.16); ctx.lineJoin = 'round';
  const arc = (x, y, r, a, b) => { ctx.beginPath(); ctx.arc(x, y, r, a, b); ctx.stroke(); };
  const dot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 0.35, 0, 7); ctx.fill(); };
  const th = Math.acos(5.5 / 9.15), PI = Math.PI;
  ctx.strokeRect(0, 0, PW, PH);
  ctx.beginPath(); ctx.moveTo(52.5, 0); ctx.lineTo(52.5, PH); ctx.stroke();
  arc(52.5, 34, 9.15, 0, 7); dot(52.5, 34);
  ctx.strokeRect(0, 13.84, 16.5, 40.32); ctx.strokeRect(0, 24.84, 5.5, 18.32); dot(11, 34); arc(11, 34, 9.15, -th, th);
  ctx.strokeRect(88.5, 13.84, 16.5, 40.32); ctx.strokeRect(99.5, 24.84, 5.5, 18.32); dot(94, 34); arc(94, 34, 9.15, PI - th, PI + th);
  ctx.strokeRect(-2, 30.34, 2, 7.32); ctx.strokeRect(105, 30.34, 2, 7.32);
  arc(0, 0, 1, 0, PI / 2); arc(PW, 0, 1, PI / 2, PI); arc(PW, PH, 1, PI, PI * 1.5); arc(0, PH, 1, PI * 1.5, PI * 2);
  ctx.restore();
}
function drawDrawing(ctx, L, d) {
  if (d.k === 'text') {
    const [sx, sy] = w2s(L, d.x, d.y), fs = Math.max(13, 2.8 * L.s);
    ctx.font = `700 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.22; ctx.strokeStyle = lum(d.c) > 0.6 ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)';
    ctx.strokeText(d.s, sx, sy); ctx.fillStyle = d.c; ctx.fillText(d.s, sx, sy);
    return;
  }
  ctx.save(); applyWorld(ctx, L);
  if (d.k === 'pen') {
    const pts = d.pts, lw = Math.max(PENW[d.w] || 0.6, 2 / L.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = d.c; ctx.fillStyle = d.c; ctx.lineWidth = lw;
    const e = pts[pts.length - 1];
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    ctx.lineTo(e[0], e[1]); ctx.stroke();
    if (d.arrow && pts.length > 1) {
      let j = pts.length - 2; while (j > 0 && Math.hypot(e[0] - pts[j][0], e[1] - pts[j][1]) < 1.5) j--;
      const a = Math.atan2(e[1] - pts[j][1], e[0] - pts[j][0]), h = Math.max(1.7, lw * 3.5);
      ctx.beginPath(); ctx.moveTo(e[0] + Math.cos(a) * h * 0.7, e[1] + Math.sin(a) * h * 0.7);
      ctx.lineTo(e[0] + Math.cos(a + 2.5) * h, e[1] + Math.sin(a + 2.5) * h);
      ctx.lineTo(e[0] + Math.cos(a - 2.5) * h, e[1] + Math.sin(a - 2.5) * h); ctx.closePath(); ctx.fill();
    }
  } else {
    const x = Math.min(d.a[0], d.b[0]), y = Math.min(d.a[1], d.b[1]), w = Math.abs(d.a[0] - d.b[0]), h = Math.abs(d.a[1] - d.b[1]);
    ctx.beginPath();
    if (d.k === 'rect') ctx.rect(x, y, w, h); else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7);
    const ga = ctx.globalAlpha; ctx.fillStyle = d.c; ctx.strokeStyle = d.c;
    ctx.globalAlpha = ga * 0.28; ctx.fill();
    ctx.globalAlpha = ga * 0.9; ctx.lineWidth = Math.max(0.25, 1.5 / L.s); ctx.stroke();
  }
  ctx.restore();
}
function drawPiece(ctx, L, P, p, xy, sel) {
  const [sx, sy] = w2s(L, xy[0], xy[1]); let r = pieceR(L);
  if (p.t === 'b') {
    r *= 0.5;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.38, 0, 7); ctx.fillStyle = '#111'; ctx.fill();
  } else {
    const c = pieceColor(p);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2; ctx.fillStyle = c; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = P.outline; ctx.stroke();
    if (p.num !== '') {
      ctx.fillStyle = lum(c) > 0.55 ? '#111' : '#fff'; ctx.font = `700 ${r * (String(p.num).length > 2 ? 0.8 : 1.02)}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.num, sx, sy + r * 0.06);
    }
    if (settings.showNames && p.name) {
      const fs = Math.max(11, r * 0.66); ctx.font = `600 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(p.name).width + fs * 0.8, h = fs * 1.35, y = sy + r + h / 2 + 2;
      ctx.fillStyle = P.labelBg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - w / 2, y - h / 2, w, h, h / 2) : ctx.rect(sx - w / 2, y - h / 2, w, h); ctx.fill();
      ctx.fillStyle = P.label; ctx.fillText(p.name, sx, y + 0.5);
    }
  }
  if (sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd400'; ctx.stroke(); }
}
function drawTrails(ctx, L, pos) {
  const prev = board.frames[board.cur - 1].pos, r = pieceR(L);
  ctx.save(); ctx.lineWidth = 2;
  for (const p of board.pieces) {
    const a = prev[p.id], b = pos[p.id];
    if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) continue;
    const A = w2s(L, a[0], a[1]), B = w2s(L, b[0], b[1]);
    ctx.strokeStyle = p.t === 'b' ? '#ffffff' : pieceColor(p); ctx.globalAlpha = 0.75;
    ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(A[0], A[1], r * (p.t === 'b' ? 0.3 : 0.55), 0, 7); ctx.stroke();
  }
  ctx.restore();
}
function render(ctx, W, H, st) {
  const P = PITCH[settings.theme] || PITCH.grass, L = layoutFor(W, H, board.view);
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  drawPitch(ctx, L, P);
  ctx.save(); ctx.globalAlpha = st.alpha ?? 1; for (const d of st.draws) drawDrawing(ctx, L, d); ctx.restore();
  if (st.temp) drawDrawing(ctx, L, st.temp);
  if (st.edit && board.cur > 0) drawTrails(ctx, L, st.pos);
  const order = [...board.pieces].sort((a, b) => (a.t === 'b') - (b.t === 'b'));
  for (const p of order) { const xy = st.pos[p.id]; if (xy) drawPiece(ctx, L, P, p, xy, st.edit && selId === p.id); }
}

/* ---------- キャンバス ---------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let cvW = 300, cvH = 200, raf = 0;
const curL = () => layoutFor(cvW, cvH, board.view);
function resize() {
  const r = $('#stage').getBoundingClientRect(); if (!r.width || !r.height) return;
  cvW = r.width; cvH = r.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), even = n => Math.round(n / 2) * 2;
  cv.width = even(cvW * dpr); cv.height = even(cvH * dpr);
  closePop(); requestRender();
}
function requestRender() { if (!raf) raf = requestAnimationFrame(frameTick); }
function frameTick(now) {
  raf = 0; if (!board) return;
  let st = null;
  if (anim) { st = animState(now); if (!st) finishAnim(true); else if (st.idx !== anim.shown) { anim.shown = st.idx; markFrame(st.idx); } }
  if (!st) st = { pos: curPos(), draws: curDraw(), temp: drawing, edit: !recording && !document.body.classList.contains('present') || (selId && !recording) };
  ctx.setTransform(cv.width / cvW, 0, 0, cv.height / cvH, 0, 0);
  render(ctx, cvW, cvH, st);
  if (anim) requestRender();
}

/* ---------- アニメーション ---------- */
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function animState(now) {
  const sp = settings.speed, hold = 650 / sp, move = 1400 / sp, fs = board.frames, n = fs.length;
  const t = Math.max(0, now - anim.start), unit = hold + move;
  if (t >= (n - 1) * unit + hold + 500) return null;
  const i = Math.min(Math.floor(t / unit), n - 1), u = t - i * unit;
  if (i >= n - 1 || u < hold) return { pos: fs[i].pos, draws: fs[i].draw, idx: i };
  const k = ease((u - hold) / move), a = fs[i].pos, b = fs[i + 1].pos, pos = {};
  for (const p of board.pieces) { const A = a[p.id] || b[p.id], B = b[p.id] || A; if (A) pos[p.id] = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]; }
  return { pos, draws: fs[i].draw, alpha: 1 - k, idx: i };
}
function play(onDone) {
  if (anim) { finishAnim(false); return; }
  if (board.frames.length < 2) { toast('「＋コマ追加」でコマを2つ以上作ると再生できます'); return; }
  closePop(); selId = null;
  anim = { start: performance.now() + 60, shown: -1, onDone };
  document.body.classList.add('playing'); setPlayLabel(); requestRender();
}
function finishAnim(completed) {
  const cb = anim && anim.onDone; anim = null;
  document.body.classList.remove('playing');
  if (completed) board.cur = board.frames.length - 1;
  setPlayLabel(); refreshFrames(); requestRender();
  if (cb) cb(completed);
}
function setPlayLabel() {
  $('#btnPlay span').textContent = anim ? '停止' : '再生';
  $('#pPlay').textContent = anim ? '停止' : '再生';
}

/* ---------- 入力 ---------- */
function evXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function hitPiece(px, py, t) {
  const L = curL(), pos = curPos(), R = Math.max(pieceR(L), 22);
  let best = null, bd = Infinity;
  for (const p of board.pieces) {
    if (t && p.t !== t) continue; const xy = pos[p.id]; if (!xy) continue;
    const [sx, sy] = w2s(L, xy[0], xy[1]), d = Math.hypot(px - sx, py - sy) - (p.t === 'b' ? 4 : 0);
    if (d <= R && d < bd) { bd = d; best = p; }
  }
  return best;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function hitDrawing(d, w, th) {
  if (d.k === 'pen') { for (let i = 0; i < d.pts.length - 1; i++) if (segDist(w, d.pts[i], d.pts[i + 1]) < th + (PENW[d.w] || 0.6)) return true; return false; }
  if (d.k === 'text') return Math.abs(w[0] - d.x) < th + 1.6 + (curL().v.rot ? 0 : d.s.length * 1.3) && Math.abs(w[1] - d.y) < th + 1.6 + (curL().v.rot ? d.s.length * 1.3 : 0);
  const cx = (d.a[0] + d.b[0]) / 2, cy = (d.a[1] + d.b[1]) / 2, hw = Math.abs(d.a[0] - d.b[0]) / 2, hh = Math.abs(d.a[1] - d.b[1]) / 2;
  if (d.k === 'rect') return Math.abs(w[0] - cx) <= hw && Math.abs(w[1] - cy) <= hh;
  return ((w[0] - cx) / hw) ** 2 + ((w[1] - cy) / hh) ** 2 <= 1;
}
function eraseAt(px, py, s) {
  const L = curL(), w = s2w(L, px, py), ds = curDraw(), th = 12 / L.s;
  for (let i = ds.length - 1; i >= 0; i--) if (hitDrawing(ds[i], w, th)) {
    if (!s.snapped) { snap(); s.snapped = true; }
    curDraw().splice(i, 1); requestRender(); return;
  }
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); if (anim) return;
  closePop();
  const [px, py] = evXY(e), L = curL(), w = s2w(L, px, py);
  try { cv.setPointerCapture(e.pointerId); } catch {}
  if (tool === 'select') {
    const p = hitPiece(px, py);
    if (!p) { selId = null; requestRender(); return; }
    const xy = curPos()[p.id];
    ptrs.set(e.pointerId, { k: 'piece', p, px, py, dx: xy[0] - w[0], dy: xy[1] - w[1], moved: false });
    selId = p.id;
  } else if (tool === 'erase') {
    const s = { k: 'erase', snapped: false }; ptrs.set(e.pointerId, s); eraseAt(px, py, s);
  } else if (tool === 'text') {
    ptrs.set(e.pointerId, { k: 'text', w });
  } else if (!drawing) {
    drawing = tool === 'pen' ? { k: 'pen', c: penColor, w: penW, arrow: penArrow, pts: [[r1(w[0]), r1(w[1])]] } : { k: tool, c: penColor, a: w.map(r1), b: w.map(r1) };
    ptrs.set(e.pointerId, { k: 'draw' });
  }
  requestRender();
});
cv.addEventListener('pointermove', e => {
  const s = ptrs.get(e.pointerId); if (!s) return;
  const [px, py] = evXY(e), w = s2w(curL(), px, py);
  if (s.k === 'piece') {
    if (!s.moved) { if (Math.hypot(px - s.px, py - s.py) < 6) return; s.moved = true; snap(); }
    curPos()[s.p.id] = [clamp(r2(w[0] + s.dx), -6, PW + 6), clamp(r2(w[1] + s.dy), -6, PH + 6)];
  } else if (s.k === 'draw' && drawing) {
    if (drawing.k === 'pen') { const l = drawing.pts[drawing.pts.length - 1]; if (Math.hypot(w[0] - l[0], w[1] - l[1]) >= 0.4) drawing.pts.push([r1(w[0]), r1(w[1])]); }
    else drawing.b = w.map(r1);
  } else if (s.k === 'erase') eraseAt(px, py, s);
  requestRender();
});
function pointerEnd(e) {
  const s = ptrs.get(e.pointerId); if (!s) return; ptrs.delete(e.pointerId);
  const up = e.type === 'pointerup';
  if (s.k === 'piece') { if (s.moved) changed(); else if (up) openPop(s.p); }
  else if (s.k === 'draw') {
    const d = drawing; drawing = null; let ok = false;
    if (d && d.k === 'pen') { let len = 0; for (let i = 1; i < d.pts.length; i++) len += Math.hypot(d.pts[i][0] - d.pts[i - 1][0], d.pts[i][1] - d.pts[i - 1][1]); ok = len >= 0.8; }
    else if (d) ok = Math.abs(d.a[0] - d.b[0]) > 1 && Math.abs(d.a[1] - d.b[1]) > 1;
    if (ok) { snap(); curDraw().push(d); changed(); } else requestRender();
  } else if (s.k === 'text' && up) {
    ask({ title: 'テキストを入力', value: '', placeholder: '例: ここを使う' }).then(v => { if (!v) return; snap(); curDraw().push({ k: 'text', c: penColor, x: r1(s.w[0]), y: r1(s.w[1]), s: v }); changed(); });
  } else if (s.k === 'erase' && s.snapped) changed();
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- 駒のポップオーバー ---------- */
const pop = $('#pop');
function closePop() { if (!pop.hidden) { pop.hidden = true; pop.replaceChildren(); } }
function openPop(p) {
  selId = p.id; pop.replaceChildren();
  const edit = fn => { snap(); fn(); changed(); };
  if (p.t !== 'b') {
    const num = el('input', { type: 'text', className: 'num', inputMode: 'numeric', value: p.num, placeholder: '番号' });
    const nm = el('input', { type: 'text', className: 'nm', value: p.name, placeholder: '名前' });
    num.onchange = () => edit(() => { p.num = num.value.trim().slice(0, 3); });
    nm.onchange = () => edit(() => { p.name = nm.value.trim().slice(0, 12); });
    const gk = el('input', { type: 'checkbox', checked: !!p.gk });
    gk.onchange = () => edit(() => { p.gk = gk.checked; });
    pop.append(el('div', { className: 'r' }, num, nm), el('label', { className: 'chk' }, gk, ' GK（色を変える）'));
    if (p.t === 'h') {
      const bp = benchPlayers();
      if (bp.length) {
        const box = el('div', { className: 'subs' });
        for (const pl of bp) box.append(el('button', { textContent: `${pl.num} ${pl.name}`.trim(), onclick: () => { edit(() => assignPlayer(p, pl)); closePop(); toast(`${pl.num} ${pl.name} を入れました`); } }));
        pop.append(el('h5', { textContent: 'ベンチの選手と交代' }), box);
      }
    }
  } else pop.append(el('div', { textContent: 'ボール', style: 'font-weight:700' }));
  pop.append(el('button', { className: 'btn sm danger', textContent: 'この駒を削除', onclick: () => { edit(() => deletePiece(p.id)); selId = null; closePop(); requestRender(); } }));
  pop.hidden = false;
  const L = curL(), xy = curPos()[p.id], [sx, sy] = w2s(L, xy[0], xy[1]), r = pieceR(L), pw = 236, ph = pop.offsetHeight;
  let x = sx + r + 12; if (x + pw > cvW - 6) x = sx - r - 12 - pw;
  pop.style.left = clamp(x, 6, Math.max(6, cvW - pw - 6)) + 'px';
  pop.style.top = clamp(sy - ph / 2, 6, Math.max(6, cvH - ph - 6)) + 'px';
  requestRender();
}

/* ---------- UI 更新 ---------- */
function refreshFrames() {
  const box = $('#frameList'); box.replaceChildren();
  board.frames.forEach((_, i) => box.append(el('button', { className: 'fchip' + (i === board.cur ? ' on' : ''), textContent: i + 1, onclick: () => gotoFrame(i) })));
  $('#pInfo').textContent = `${board.cur + 1} / ${board.frames.length}`;
  const on = box.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function markFrame(i) { $$('#frameList .fchip').forEach((c, j) => c.classList.toggle('on', i === j)); $('#pInfo').textContent = `${i + 1} / ${board.frames.length}`; }
function gotoFrame(i) { if (anim) finishAnim(false); board.cur = clamp(i, 0, board.frames.length - 1); closePop(); selId = null; refreshFrames(); requestRender(); flushSave(); }
function refreshBench() {
  const box = $('#benchList'); box.replaceChildren();
  if (!roster.length) { box.append(el('div', { className: 'empty', textContent: '「メンバー」で選手を登録すると、控えがここに並びます' })); return; }
  const bp = benchPlayers();
  if (!bp.length) { box.append(el('div', { className: 'empty', textContent: '全員出場中' })); return; }
  for (const pl of bp) {
    const chip = el('div', { className: 'chip' }, el('b', { textContent: pl.num, style: `background:${settings.colors.h};color:${lum(settings.colors.h) > 0.55 ? '#111' : '#fff'}` }), el('span', { textContent: pl.name }));
    chip.addEventListener('pointerdown', e => benchDown(e, pl, chip));
    box.append(chip);
  }
}
function benchDown(e, pl, chip) {
  e.preventDefault(); if (anim) return;
  try { chip.setPointerCapture(e.pointerId); } catch {}
  const g = el('div', { className: 'ghost', textContent: pl.num }); g.style.background = settings.colors.h; document.body.append(g);
  const mv = ev => { g.style.left = ev.clientX + 'px'; g.style.top = ev.clientY + 'px'; }; mv(e);
  const done = ev => {
    chip.removeEventListener('pointermove', mv); chip.removeEventListener('pointerup', done); chip.removeEventListener('pointercancel', done); g.remove();
    if (ev.type !== 'pointerup') return;
    const r = cv.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
    const px = ev.clientX - r.left, py = ev.clientY - r.top, hit = hitPiece(px, py, 'h');
    snap();
    if (hit) { const out = `${hit.num} ${hit.name}`.trim(); assignPlayer(hit, pl); toast(`交代：${out} → ${pl.num} ${pl.name}`); }
    else { const w = s2w(curL(), px, py); addPiece('h', { x: w[0], y: w[1], pl }); }
    changed();
  };
  chip.addEventListener('pointermove', mv); chip.addEventListener('pointerup', done); chip.addEventListener('pointercancel', done);
}
function refreshUI() {
  $('#boardName').textContent = board.name;
  $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length;
  $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === board.view));
  refreshFrames(); refreshBench();
}
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  if (settings.theme === 'white' && penColor === '#ffffff') setPenColor('#111111');
  if (settings.theme !== 'white' && penColor === '#111111') setPenColor('#ffffff');
}
function setPenColor(c) { penColor = c; $$('#colors .sw').forEach(b => b.classList.toggle('on', b.dataset.c === c)); }
function setTool(t) { tool = t; closePop(); $$('#tools .tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); if (t !== 'select') { selId = null; requestRender(); } }
const saveSettings = () => store.set('settings', settings);

let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400); }
function ask({ title, text = '', value, placeholder = '', ok = 'OK' }) {
  return new Promise(res => {
    const d = $('#dlgAsk'), inp = $('#askInput');
    $('#askTitle').textContent = title; $('#askText').textContent = text; $('#askText').hidden = !text; $('#askOk').textContent = ok;
    inp.hidden = value === undefined; inp.value = value || ''; inp.placeholder = placeholder;
    d.returnValue = ''; d.showModal(); if (!inp.hidden) { inp.focus(); inp.select(); }
    d.onclose = () => res(d.returnValue === 'ok' ? (inp.hidden ? true : inp.value.trim()) : null);
  });
}
$$('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
});

/* ---------- ツールバー ---------- */
$$('#tools .tool[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$$('#colors .sw').forEach(b => b.onclick = () => { setPenColor(b.dataset.c); if (tool === 'select' || tool === 'erase') setTool('pen'); });
$$('#widths .wd').forEach(b => b.onclick = () => { penW = +b.dataset.w; $$('#widths .wd').forEach(x => x.classList.toggle('on', x === b)); });
$('#btnArrow').onclick = () => { penArrow = !penArrow; $('#btnArrow').classList.toggle('on', penArrow); };
$('#btnClear').onclick = () => { if (!curDraw().length) return; snap(); curFrame().draw = []; changed(); };
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$$('#viewSeg button').forEach(b => b.onclick = () => { board.view = b.dataset.view; closePop(); changed(); });

const viewCenter = (dx = 0, dy = 0) => { const w = s2w(curL(), cvW / 2, cvH / 2); return { x: clamp(w[0] + dx, 2, PW - 2), y: clamp(w[1] + dy, 2, PH - 2) }; };
const jitter = () => (Math.random() - 0.5) * 6;
$('#addH').onclick = () => { snap(); const p = addPiece('h', viewCenter(-4 + jitter(), jitter())); selId = p.id; setTool('select'); changed(); };
$('#addA').onclick = () => { snap(); const p = addPiece('a', viewCenter(4 + jitter(), jitter())); selId = p.id; setTool('select'); changed(); };
$('#addB').onclick = () => { snap(); addPiece('b', viewCenter(jitter() / 2, jitter() / 2)); setTool('select'); changed(); };

/* ---------- コマ ---------- */
$('#btnAddFrame').onclick = () => { if (anim) return; snap(); board.frames.splice(board.cur + 1, 0, { pos: clone(curPos()), draw: [] }); board.cur++; changed(); toast(`コマ${board.cur + 1}：駒を次の位置へ動かしてください`); };
$('#btnDelFrame').onclick = () => { if (anim) return; if (board.frames.length < 2) { toast('コマは最低1つ必要です'); return; } snap(); board.frames.splice(board.cur, 1); board.cur = Math.min(board.cur, board.frames.length - 1); changed(); };
$('#btnPlay').onclick = () => play();
$('#btnSpeed').onclick = () => { const o = [0.5, 1, 2]; settings.speed = o[(o.indexOf(settings.speed) + 1) % 3]; $('#btnSpeed').textContent = settings.speed + '×'; saveSettings(); };

/* ---------- プレゼンモード ---------- */
function setPresent(on) { if (anim) finishAnim(false); closePop(); selId = null; setTool('select'); document.body.classList.toggle('present', on); }
$('#btnPresent').onclick = () => setPresent(true);
$('#pExit').onclick = () => setPresent(false);
$('#pPrev').onclick = () => gotoFrame(board.cur - 1);
$('#pNext').onclick = () => gotoFrame(board.cur + 1);
$('#pPlay').onclick = () => { if (!anim && board.cur === board.frames.length - 1) board.cur = 0; play(); };

/* ---------- ボード一覧 ---------- */
function renderBoards() {
  const box = $('#boardList'); box.replaceChildren();
  const fmt = t => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  for (const b of Object.values(boards).sort((a, b) => b.updated - a.updated)) {
    const open = el('button', { className: 'open', onclick: () => { openBoard(boards[b.id]); $('#dlgBoards').close(); } }, el('b', { textContent: b.name }), el('small', { textContent: `${fmt(b.updated)}・${b.frames.length}コマ` }));
    const ren = el('button', { className: 'btn sm', textContent: '名前', onclick: async () => { const v = await ask({ title: 'ボード名を変更', value: b.name }); if (!v) return; b.name = v.slice(0, 30); store.set('boards', boards); refreshUI(); renderBoards(); } });
    const dup = el('button', { className: 'btn sm', textContent: '複製', onclick: () => { flushSave(); const c = clone(boards[b.id]); c.id = uid(); c.name = b.name + ' のコピー'; c.updated = Date.now(); boards[c.id] = c; store.set('boards', boards); renderBoards(); } });
    const del = el('button', { className: 'btn sm danger', textContent: '削除', onclick: async () => {
      if (!await ask({ title: `「${b.name}」を削除しますか？`, text: '削除すると元に戻せません。', ok: '削除する' })) return;
      delete boards[b.id];
      if (!Object.keys(boards).length) { const n = newBoard('ボード 1'); boards[n.id] = n; }
      store.set('boards', boards);
      if (board.id === b.id) { board = null; openBoard(Object.values(boards).sort((a, b) => b.updated - a.updated)[0]); }
      renderBoards();
    } });
    box.append(el('div', { className: 'item' + (b.id === board.id ? ' cur' : '') }, open, ren, dup, del));
  }
}
$('#btnBoards').onclick = () => { flushSave(); renderBoards(); $('#dlgBoards').showModal(); };
$('#btnNewBoard').onclick = async () => {
  const v = await ask({ title: '新しいボード', value: `ボード ${Object.keys(boards).length + 1}`, placeholder: '例: 対○○戦 ビルドアップ' }); if (!v) return;
  const b = newBoard(v.slice(0, 30)); boards[b.id] = b; store.set('boards', boards); openBoard(b); $('#dlgBoards').close();
};

/* ---------- フォーメーション ---------- */
let fmTeam = 'h';
function doFormation(str) {
  if (!parseFormation(str)) { toast('「4-4-2」のように数字を - で区切って入力してください'); return; }
  snap(); applyFormation(fmTeam, str); changed(); $('#dlgFormation').close();
  toast(`${fmTeam === 'h' ? '自チーム' : '相手'}：${parseFormation(str).join('-')}（${team(fmTeam).length}人）`);
}
(function buildPresets() {
  const box = $('#fmPresets');
  for (const [g, list] of Object.entries(PRESETS)) {
    const ps = el('div', { className: 'ps' });
    for (const f of list) ps.append(el('button', { className: 'btn sm', textContent: f, onclick: () => doFormation(f) }));
    box.append(el('h4', { textContent: g }), ps);
  }
})();
$$('#fmTeam button').forEach(b => b.onclick = () => { fmTeam = b.dataset.t; $$('#fmTeam button').forEach(x => x.classList.toggle('on', x === b)); });
$('#fmApply').onclick = () => doFormation($('#fmCustom').value);
$('#btnFormation').onclick = () => { if (anim) finishAnim(false); $('#dlgFormation').showModal(); };

/* ---------- メンバー表 ---------- */
function syncPlayer(pl) { for (const p of board.pieces) if (p.pid === pl.id) { p.num = pl.num; p.name = pl.name; } }
function rosterChanged() { store.set('roster', roster); refreshBench(); requestRender(); clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 300); }
function renderRoster() {
  const box = $('#rosterList'); box.replaceChildren();
  if (!roster.length) box.append(el('p', { className: 'hint', textContent: 'まだ選手がいません。「＋ 選手を追加」から登録してください。' }));
  for (const pl of roster) {
    const num = el('input', { type: 'text', className: 'num', inputMode: 'numeric', value: pl.num, placeholder: '番号' });
    const nm = el('input', { type: 'text', value: pl.name, placeholder: '名前' });
    num.oninput = () => { pl.num = num.value.trim().slice(0, 3); syncPlayer(pl); rosterChanged(); };
    nm.oninput = () => { pl.name = nm.value.trim().slice(0, 12); syncPlayer(pl); rosterChanged(); };
    const del = el('button', { className: 'btn sm danger', textContent: '削除', onclick: () => { roster = roster.filter(x => x !== pl); for (const p of board.pieces) if (p.pid === pl.id) p.pid = null; rosterChanged(); renderRoster(); } });
    box.append(el('div', { className: 'item' }, num, nm, del));
  }
}
$('#btnRoster').onclick = () => { if (anim) finishAnim(false); closePop(); renderRoster(); $('#dlgRoster').showModal(); };
$('#btnAddPlayer').onclick = () => {
  const used = new Set(roster.map(p => p.num)); let n = 1; while (used.has(String(n))) n++;
  roster.push({ id: uid(), num: String(n), name: '' }); rosterChanged(); renderRoster();
  const rows = $$('#rosterList .item'); rows[rows.length - 1].querySelectorAll('input')[1].focus(); $('#rosterList').scrollTop = 1e6;
};
$('#btnAssign').onclick = () => {
  if (!roster.length) { toast('先に選手を登録してください'); return; }
  snap(); team('h').forEach((p, i) => { if (roster[i]) assignPlayer(p, roster[i]); else p.pid = null; }); changed();
  toast('登録順にスタメンへ割り当てました');
};

/* ---------- 設定 ---------- */
function renderSettings() {
  $$('#setTheme button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.theme));
  $$('#setSize button').forEach(b => b.classList.toggle('on', +b.dataset.v === settings.size));
  $$('#dlgSettings [data-col]').forEach(i => { i.value = settings.colors[i.dataset.col]; });
  $('#setNames').checked = settings.showNames;
}
$('#btnSettings').onclick = () => { renderSettings(); $('#dlgSettings').showModal(); };
$$('#setTheme button').forEach(b => b.onclick = () => { settings.theme = b.dataset.v; applyTheme(); saveSettings(); renderSettings(); requestRender(); });
$$('#setSize button').forEach(b => b.onclick = () => { settings.size = +b.dataset.v; saveSettings(); renderSettings(); requestRender(); });
$$('#dlgSettings [data-col]').forEach(i => i.oninput = () => { settings.colors[i.dataset.col] = i.value; saveSettings(); refreshBench(); requestRender(); });
$('#setNames').onchange = () => { settings.showNames = $('#setNames').checked; saveSettings(); requestRender(); };

/* ---------- タイマー・スコア ---------- */
const matchMs = () => match.elapsed + (match.running ? Date.now() - match.startAt : 0);
const fmtTime = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const saveMatch = () => store.set('match', match);
function renderMatch() {
  const t = fmtTime(matchMs());
  $('#mTime').textContent = t; $('#mBig').textContent = t;
  $('#mHalf').textContent = match.half === 1 ? '前半' : '後半';
  $('#mScore').textContent = `${match.h} - ${match.a}`; $('#sH').textContent = match.h; $('#sA').textContent = match.a;
  $('#matchWidget').classList.toggle('run', match.running);
  $('#mToggle').textContent = match.running ? 'ストップ' : 'スタート';
  $$('#mHalfSeg button').forEach(b => b.classList.toggle('on', +b.dataset.v === match.half));
}
setInterval(() => { if (match.running) renderMatch(); }, 250);
$('#matchWidget').onclick = () => { renderMatch(); $('#dlgMatch').showModal(); };
$('#mToggle').onclick = () => { if (match.running) { match.elapsed = matchMs(); match.running = false; } else { match.startAt = Date.now(); match.running = true; } saveMatch(); renderMatch(); };
$('#mReset').onclick = () => { match.elapsed = 0; match.startAt = Date.now(); saveMatch(); renderMatch(); };
$$('#mHalfSeg button').forEach(b => b.onclick = () => { match.half = +b.dataset.v; saveMatch(); renderMatch(); });
$$('#dlgMatch [data-s]').forEach(b => b.onclick = () => { const k = b.dataset.s; match[k] = Math.max(0, match[k] + +b.dataset.d); saveMatch(); renderMatch(); });
$('#mClear').onclick = async () => { if (!await ask({ title: '試合をリセットしますか？', text: 'タイマーとスコアを0に戻します。', ok: 'リセット' })) return; Object.assign(match, { half: 1, running: false, startAt: 0, elapsed: 0, h: 0, a: 0 }); saveMatch(); renderMatch(); };

/* ---------- 書き出し ---------- */
let resFile = null, resUrl = '';
function showResult(blob, ext) {
  const safe = board.name.replace(/[\\/:*?"<>|]/g, '_');
  resFile = new File([blob], `${safe}.${ext}`, { type: blob.type });
  if (resUrl) URL.revokeObjectURL(resUrl); resUrl = URL.createObjectURL(blob);
  const pv = ext === 'png' ? el('img', { src: resUrl }) : el('video', { src: resUrl, controls: true, playsInline: true, loop: true, muted: true });
  $('#resPreview').replaceChildren(pv);
  const a = $('#resDl'); a.href = resUrl; a.download = resFile.name;
  $('#resShare').hidden = !(navigator.canShare && navigator.canShare({ files: [resFile] }));
  $('#dlgResult').showModal();
}
$('#resShare').onclick = async () => { try { await navigator.share({ files: [resFile] }); } catch (e) { if (e.name !== 'AbortError') toast('共有できませんでした。「ダウンロード」を使ってください'); } };
$('#dlgResult').addEventListener('close', () => { $('#resPreview').replaceChildren(); });
$('#btnExport').onclick = () => { if (anim) finishAnim(false); closePop(); $('#dlgExport').showModal(); };
$('#exImg').onclick = () => {
  $('#dlgExport').close();
  const c = document.createElement('canvas'), sc = 2; c.width = Math.round(cvW * sc); c.height = Math.round(cvH * sc);
  const x = c.getContext('2d'); x.scale(sc, sc);
  render(x, cvW, cvH, { pos: curPos(), draws: curDraw(), edit: false });
  c.toBlob(b => b ? showResult(b, 'png') : toast('画像を作れませんでした'), 'image/png');
};
$('#exVid').onclick = () => {
  $('#dlgExport').close();
  if (board.frames.length < 2) { toast('動画にするにはコマを2つ以上作ってください'); return; }
  if (!window.MediaRecorder || !cv.captureStream) { toast('このブラウザは動画の書き出しに対応していません'); return; }
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) { toast('このブラウザは動画の書き出しに対応していません'); return; }
  let rec; const chunks = [], stream = cv.captureStream(30);
  try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 }); } catch { toast('録画を開始できませんでした'); return; }
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    recording = false; $('#recBadge').hidden = true; stream.getTracks().forEach(t => t.stop()); requestRender();
    if (chunks.length) showResult(new Blob(chunks, { type: mime.split(';')[0] }), mime.includes('mp4') ? 'mp4' : 'webm'); else toast('動画を作れませんでした');
  };
  recording = true; selId = null; $('#recBadge').hidden = false;
  board.cur = 0; refreshFrames(); requestRender();
  rec.start();
  setTimeout(() => play(() => setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 250)), 150);
};

/* ---------- 起動 ---------- */
(function init() {
  if (!Object.keys(boards).length) { const b = newBoard('ボード 1'); boards[b.id] = b; store.set('boards', boards); }
  board = boards[store.get('current', '')] || Object.values(boards).sort((a, b) => b.updated - a.updated)[0];
  $('#btnSpeed').textContent = settings.speed + '×';
  applyTheme(); refreshUI(); renderMatch();
  new ResizeObserver(resize).observe($('#stage')); resize();
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
