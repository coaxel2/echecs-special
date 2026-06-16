// ===== Échecs Spécial — moteur complet + variantes + power-ups + IA minimax =====
// Plateau 8x8 : board[ligne][colonne] = pièce | null. Ligne 0 = haut (Noirs), 7 = bas (Blancs).

const SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { k: 'R', q: 'D', r: 'T', b: 'F', n: 'C', p: '' };

// Power-ups façon Mario Kart
const POWERS = ['mushroom', 'bolt', 'shell', 'bomb', 'star'];
const POWER_ICON = { mushroom: '🍄', bolt: '⚡', shell: '🐢', bomb: '💣', star: '🌟' };
const MAX_POWER_TILES = 4;
const AI_DEPTH = 3; // profondeur de recherche minimax (racine + AI_DEPTH plis)

// --- DOM ---
const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn');
const statusEl = document.getElementById('status');
const capWhiteEl = document.getElementById('captured-by-white');
const capBlackEl = document.getElementById('captured-by-black');
const newGameBtn = document.getElementById('new-game');
const historyEl = document.getElementById('history');
const clockWEl = document.getElementById('clock-w');
const clockBEl = document.getElementById('clock-b');
const promoEl = document.getElementById('promo');
const bannerEl = document.getElementById('banner');
const opt = {
  koth: document.getElementById('koth'), atomic: document.getElementById('atomic'),
  chess960: document.getElementById('chess960'), powerups: document.getElementById('powerups'),
  ai: document.getElementById('ai'), clock: document.getElementById('clock-on'), sound: document.getElementById('sound'),
};

// --- État ---
let board, turn, selected, legalMoves, gameOver, captured, enPassant, history, lastMove, powerTiles, pendingPromo;
let clocks, clockTimer;

const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isHill = (r, c) => (r === 3 || r === 4) && (c === 3 || c === 4);
const clone = (b) => b.map((row) => row.map((p) => (p ? { ...p } : null)));
const other = (col) => (col === 'w' ? 'b' : 'w');

// --- Plateaux de départ ---
function backRankStandard() { return ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']; }
function backRank960() {
  let r;
  do {
    r = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  } while (!valid960(r));
  return r;
}
function valid960(r) {
  const b = r.map((p, i) => (p === 'b' ? i : -1)).filter((i) => i >= 0);
  if (b.length !== 2 || (b[0] % 2) === (b[1] % 2)) return false;
  const k = r.indexOf('k'), rooks = r.map((p, i) => (p === 'r' ? i : -1)).filter((i) => i >= 0);
  return rooks.length === 2 && k > rooks[0] && k < rooks[1];
}
function initialBoard() {
  const back = opt.chess960.checked ? backRank960() : backRankStandard();
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'b', moved: false };
    b[1][c] = { type: 'p', color: 'b', moved: false };
    b[6][c] = { type: 'p', color: 'w', moved: false };
    b[7][c] = { type: back[c], color: 'w', moved: false };
  }
  return b;
}

// --- Attaques / échec ---
function isAttacked(b, r, c, by) {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const p = b[i][j];
    if (p && p.color === by && attacks(b, i, j, r, c)) return true;
  }
  return false;
}
function attacks(b, i, j, r, c) {
  const p = b[i][j], dr = r - i, dc = c - j;
  switch (p.type) {
    case 'p': { const d = p.color === 'w' ? -1 : 1; return dr === d && Math.abs(dc) === 1; }
    case 'n': return (Math.abs(dr) === 1 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 1);
    case 'k': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr || dc);
    case 'b': if (Math.abs(dr) !== Math.abs(dc) || !dr) return false; return clearPath(b, i, j, r, c);
    case 'r': if ((dr && dc) || (!dr && !dc)) return false; return clearPath(b, i, j, r, c);
    case 'q': if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) || (!dr && !dc)) return false; return clearPath(b, i, j, r, c);
  }
  return false;
}
function clearPath(b, i, j, r, c) {
  const sr = Math.sign(r - i), sc = Math.sign(c - j);
  let x = i + sr, y = j + sc;
  while (x !== r || y !== c) { if (b[x][y]) return false; x += sr; y += sc; }
  return true;
}

// --- Coups pseudo-légaux ---
function pseudoMoves(b, r, c, ep) {
  const p = b[r][c];
  if (!p) return [];
  const mv = [];
  const push = (nr, nc, special) => mv.push({ r: nr, c: nc, special });
  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inB(nr, nc)) {
        const t = b[nr][nc];
        if (!t) push(nr, nc); else { if (t.color !== p.color) push(nr, nc); break; }
        nr += dr; nc += dc;
      }
    }
  };
  switch (p.type) {
    case 'p': {
      const d = p.color === 'w' ? -1 : 1, start = p.color === 'w' ? 6 : 1;
      if (inB(r + d, c) && !b[r + d][c]) {
        push(r + d, c, (r + d === 0 || r + d === 7) ? 'promo' : null);
        if (r === start && !b[r + 2 * d][c]) push(r + 2 * d, c, 'double');
      }
      for (const dc of [-1, 1]) {
        const nr = r + d, nc = c + dc;
        if (!inB(nr, nc)) continue;
        if (b[nr][nc] && b[nr][nc].color !== p.color) push(nr, nc, (nr === 0 || nr === 7) ? 'promo' : null);
        else if (ep && ep.r === nr && ep.c === nc) push(nr, nc, 'enpassant');
      }
      break;
    }
    case 'n': for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nc = c + dc;
      if (inB(nr, nc) && (!b[nr][nc] || b[nr][nc].color !== p.color)) push(nr, nc);
    } break;
    case 'b': slide([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case 'r': slide([[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'q': slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'k': {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (inB(nr, nc) && (!b[nr][nc] || b[nr][nc].color !== p.color)) push(nr, nc);
      }
      if (!p.moved && !isAttacked(b, r, c, other(p.color))) {
        const rk = b[r][7];
        if (rk && rk.type === 'r' && !rk.moved && !b[r][5] && !b[r][6] && !isAttacked(b, r, 5, other(p.color)) && !isAttacked(b, r, 6, other(p.color))) push(r, 6, 'castle-k');
        const rq = b[r][0];
        if (rq && rq.type === 'r' && !rq.moved && !b[r][1] && !b[r][2] && !b[r][3] && !isAttacked(b, r, 2, other(p.color)) && !isAttacked(b, r, 3, other(p.color))) push(r, 2, 'castle-q');
      }
      break;
    }
  }
  return mv;
}
function simulate(b, from, to, ep) {
  const nb = clone(b);
  const p = nb[from.r][from.c];
  nb[to.r][to.c] = p; nb[from.r][from.c] = null;
  if (to.special === 'enpassant') nb[from.r][to.c] = null;
  if (to.special === 'promo') p.type = 'q';
  if (to.special === 'castle-k') { nb[from.r][5] = nb[from.r][7]; nb[from.r][7] = null; }
  if (to.special === 'castle-q') { nb[from.r][3] = nb[from.r][0]; nb[from.r][0] = null; }
  return nb;
}
function kingInCheck(b, color) {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    if (b[i][j] && b[i][j].type === 'k' && b[i][j].color === color) return isAttacked(b, i, j, other(color));
  return false;
}
// Coups légaux sur un board donné
function legalOn(b, r, c, ep) {
  const p = b[r][c]; if (!p) return [];
  return pseudoMoves(b, r, c, ep).filter((m) => !kingInCheck(simulate(b, { r, c }, m, ep), p.color));
}
function allLegalOn(b, color, ep) {
  const out = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    if (b[i][j] && b[i][j].color === color) for (const m of legalOn(b, i, j, ep)) out.push({ from: { r: i, c: j }, to: m });
  return out;
}
const legalFrom = (r, c) => legalOn(board, r, c, enPassant);
const allLegal = (color) => allLegalOn(board, color, enPassant);

// --- IA : minimax + élagage alpha-bêta (évalue du point de vue des Noirs) ---
function evaluate(b) {
  let s = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const p = b[i][j]; if (!p) continue;
    let v = VALUE[p.type] * 100 + (3.5 - Math.abs(i - 3.5)) + (3.5 - Math.abs(j - 3.5)); // matériel + léger bonus centre
    s += (p.color === 'b' ? 1 : -1) * v;
  }
  return s;
}
const capScore = (b, m) => (b[m.to.r][m.to.c] ? VALUE[b[m.to.r][m.to.c].type] : 0);
function minimax(b, depth, alpha, beta, color) {
  const moves = allLegalOn(b, color, null);
  if (!moves.length) return kingInCheck(b, color) ? (color === 'b' ? -1e6 - depth : 1e6 + depth) : 0;
  if (depth === 0) return evaluate(b);
  moves.sort((a, c) => capScore(b, c) - capScore(b, a));
  if (color === 'b') {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, minimax(simulate(b, m.from, m.to, null), depth - 1, alpha, beta, 'w')); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, minimax(simulate(b, m.from, m.to, null), depth - 1, alpha, beta, 'b')); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}
function aiMove() {
  if (gameOver) return;
  const moves = allLegalOn(board, 'b', enPassant);
  if (!moves.length) return;
  moves.sort((a, b) => capScore(board, b) - capScore(board, a));
  let best = moves[0], bestV = -Infinity;
  for (const m of moves) {
    const v = minimax(simulate(board, m.from, m.to, enPassant), AI_DEPTH - 1, -Infinity, Infinity, 'w') + Math.random() * 0.4;
    if (v > bestV) { bestV = v; best = m; }
  }
  play(best.from, best.to, 'q');
}

// --- Power-ups ---
function spawnPower() {
  const empty = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
    if (!board[r][c] && !powerTiles.some((t) => t.r === r && t.c === c)) empty.push({ r, c });
  if (!empty.length) return;
  const cell = empty[Math.floor(Math.random() * empty.length)];
  powerTiles.push({ r: cell.r, c: cell.c, type: POWERS[Math.floor(Math.random() * POWERS.length)] });
}
function maybeSpawnPower() {
  if (!opt.powerups.checked || powerTiles.length >= MAX_POWER_TILES) return;
  if (Math.random() < 0.34) spawnPower(); // ~1 chance sur 3 par coup
}
function applyPower(type, color, r, c) {
  const enemy = other(color);
  const targets = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    if (board[i][j] && board[i][j].color === enemy && board[i][j].type !== 'k') targets.push({ i, j });
  const zap = (t) => { if (t) { captured[color].push(board[t.i][t.j]); board[t.i][t.j] = null; } };
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let replay = false, msg = '';
  if (type === 'mushroom') { replay = true; msg = '🍄 Champignon — tu rejoues !'; }
  else if (type === 'bolt') { zap(rand(targets)); msg = '⚡ Éclair — pièce ennemie foudroyée !'; }
  else if (type === 'shell') {
    let best = null, bd = 1e9;
    for (const t of targets) { const d = Math.abs(t.i - r) + Math.abs(t.j - c); if (d < bd) { bd = d; best = t; } }
    zap(best); msg = '🐢 Carapace — pièce la plus proche éliminée !';
  } else if (type === 'bomb') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (inB(nr, nc) && board[nr][nc] && board[nr][nc].color === enemy && board[nr][nc].type !== 'k') zap({ i: nr, j: nc });
    }
    msg = '💣 Bob-omb — explosion !';
  } else if (type === 'star') { replay = true; zap(rand(targets)); msg = '🌟 Étoile — rejoue + foudroie !'; }
  beep(720, 0.09);
  statusEl.textContent = msg;
  return replay;
}

// --- Affichage ---
function render() {
  boardEl.innerHTML = '';
  const checkColor = kingInCheck(board, turn) ? turn : null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell ' + ((r + c) % 2 ? 'dark' : 'light');
    if (opt.koth.checked && isHill(r, c)) cell.classList.add('hill');
    if (lastMove && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c))) cell.classList.add('last');
    if (selected && selected.r === r && selected.c === c) cell.classList.add('selected');
    const lm = legalMoves.find((m) => m.r === r && m.c === c);
    if (lm) cell.classList.add(board[r][c] || lm.special === 'enpassant' ? 'capture' : 'move');
    const pt = powerTiles.find((t) => t.r === r && t.c === c);
    if (pt) cell.classList.add('power');
    const p = board[r][c];
    if (p) {
      const span = document.createElement('span');
      span.className = 'piece ' + p.color + (checkColor === p.color && p.type === 'k' ? ' check' : '') + (lastMove && lastMove.to.r === r && lastMove.to.c === c ? ' moved' : '');
      span.textContent = SYMBOLS[p.color][p.type];
      cell.appendChild(span);
    } else if (pt) {
      const span = document.createElement('span');
      span.className = 'power-icon'; span.textContent = POWER_ICON[pt.type];
      cell.appendChild(span);
    }
    cell.addEventListener('click', () => onClick(r, c));
    boardEl.appendChild(cell);
  }
  capWhiteEl.textContent = captured.w.map((x) => SYMBOLS[x.color][x.type]).join(' ');
  capBlackEl.textContent = captured.b.map((x) => SYMBOLS[x.color][x.type]).join(' ');
}

// --- Interaction ---
function onClick(r, c) {
  if (gameOver || pendingPromo) return;
  const move = legalMoves.find((m) => m.r === r && m.c === c);
  if (selected && move) return play(selected, move);
  const p = board[r][c];
  if (p && p.color === turn && !(opt.ai.checked && turn === 'b')) { selected = { r, c }; legalMoves = legalFrom(r, c); }
  else { selected = null; legalMoves = []; }
  render();
}

function play(from, to, promoChoice) {
  const p = board[from.r][from.c];
  if (to.special === 'promo' && !promoChoice && !(opt.ai.checked && p.color === 'b')) { pendingPromo = { from, to }; showPromo(p.color); return; }

  const capturedPiece = board[to.r][to.c] || (to.special === 'enpassant' ? board[from.r][to.c] : null);
  let notation = NAME[p.type] + (capturedPiece ? (p.type === 'p' ? 'abcdefgh'[from.c] : '') + 'x' : '') + 'abcdefgh'[to.c] + (8 - to.r);
  if (to.special === 'castle-k') notation = 'O-O';
  if (to.special === 'castle-q') notation = 'O-O-O';

  board[to.r][to.c] = p; board[from.r][from.c] = null; p.moved = true;
  if (to.special === 'enpassant') board[from.r][to.c] = null;
  if (to.special === 'castle-k') { board[from.r][5] = board[from.r][7]; board[from.r][7] = null; board[from.r][5].moved = true; }
  if (to.special === 'castle-q') { board[from.r][3] = board[from.r][0]; board[from.r][0] = null; board[from.r][3].moved = true; }
  if (to.special === 'promo') { p.type = promoChoice || 'q'; notation += '=' + NAME[p.type]; }
  if (capturedPiece) { captured[p.color].push(capturedPiece); beep(180, 0.06); } else beep(330, 0.04);

  enPassant = (to.special === 'double') ? { r: (from.r + to.r) / 2, c: to.c } : null;

  let atomicKing = null;
  if (opt.atomic.checked && capturedPiece) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = to.r + dr, nc = to.c + dc;
      if (!inB(nr, nc)) continue;
      const q = board[nr][nc];
      if (q && (q.type !== 'p' || (nr === to.r && nc === to.c))) { if (q.type === 'k') atomicKing = q.color; board[nr][nc] = null; }
    }
    board[to.r][to.c] = null; beep(90, 0.12);
  }

  // Power-up ramassé
  let replay = false;
  const ti = powerTiles.findIndex((t) => t.r === to.r && t.c === to.c);
  if (ti >= 0 && !atomicKing) { const t = powerTiles[ti]; powerTiles.splice(ti, 1); replay = applyPower(t.type, p.color, to.r, to.c); }

  lastMove = { from, to };
  selected = null; legalMoves = [];

  if (atomicKing) return end(`${atomicKing === 'w' ? 'Les Noirs' : 'Les Blancs'} gagnent ! 💥 Roi pulvérisé`, notation);
  if (opt.koth.checked && p.type === 'k' && isHill(to.r, to.c)) return end(`${p.color === 'w' ? 'Les Blancs' : 'Les Noirs'} gagnent ! 👑 Roi au sommet`, notation);

  if (!replay) { turn = other(turn); maybeSpawnPower(); }

  const moves = allLegal(turn);
  const inCheck = kingInCheck(board, turn);
  if (!moves.length) {
    addHistory(notation + (inCheck ? '#' : '')); render();
    if (inCheck) return end(`Échec et mat ! ${turn === 'w' ? 'Les Noirs' : 'Les Blancs'} gagnent 🏆`);
    return end('Pat — partie nulle 🤝');
  }
  addHistory(notation + (inCheck ? '+' : ''));
  if (!replay || !statusEl.textContent) { /* garde le message power-up si présent */ }
  turnEl.innerHTML = `Trait aux <strong>${turn === 'w' ? 'Blancs' : 'Noirs'}</strong>` + (inCheck ? ' <span class="chk">échec !</span>' : '');
  render(); switchClock();
  if (opt.ai.checked && turn === 'b' && !gameOver) setTimeout(aiMove, 320);
}

// --- Promotion ---
function showPromo(color) {
  promoEl.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    b.textContent = SYMBOLS[color][t]; b.className = 'promo-btn ' + color;
    b.addEventListener('click', () => { const pp = pendingPromo; pendingPromo = null; promoEl.classList.remove('show'); play(pp.from, pp.to, t); });
    promoEl.appendChild(b);
  }
  promoEl.classList.add('show');
}

// --- Historique / horloge / son / fin ---
function addHistory(txt) {
  history.push(txt);
  historyEl.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('div');
    li.className = 'move-row';
    li.innerHTML = `<span class="num">${i / 2 + 1}.</span> <span>${history[i] || ''}</span> <span>${history[i + 1] || ''}</span>`;
    historyEl.appendChild(li);
  }
  historyEl.scrollTop = historyEl.scrollHeight;
}
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function switchClock() {
  if (!opt.clock.checked) { updateClocks(); return; }
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    clocks[turn] -= 1;
    if (clocks[turn] <= 0) { clocks[turn] = 0; updateClocks(); return end(`Temps écoulé — ${turn === 'w' ? 'Les Noirs' : 'Les Blancs'} gagnent ⏱️`); }
    updateClocks();
  }, 1000);
  updateClocks();
}
function updateClocks() {
  clockWEl.textContent = fmt(clocks.w); clockBEl.textContent = fmt(clocks.b);
  clockWEl.classList.toggle('active', turn === 'w' && opt.clock.checked && !gameOver);
  clockBEl.classList.toggle('active', turn === 'b' && opt.clock.checked && !gameOver);
}
let audioCtx;
function beep(freq, dur) {
  if (!opt.sound.checked) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.type = 'triangle'; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.08, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}
function end(msg, lastNotation) {
  if (lastNotation) addHistory(lastNotation);
  gameOver = true; clearInterval(clockTimer); selected = null; legalMoves = [];
  statusEl.textContent = msg; bannerEl.textContent = msg; bannerEl.classList.add('show');
  updateClocks(); render();
}

// --- Nouvelle partie ---
function newGame() {
  clearInterval(clockTimer);
  board = initialBoard();
  turn = 'w'; selected = null; legalMoves = []; gameOver = false;
  captured = { w: [], b: [] }; enPassant = null; history = []; lastMove = null; pendingPromo = null;
  powerTiles = [];
  if (opt.powerups.checked) { spawnPower(); spawnPower(); } // 2 cases au départ, d'autres apparaîtront
  clocks = { w: 300, b: 300 };
  statusEl.textContent = ''; bannerEl.classList.remove('show'); historyEl.innerHTML = '';
  turnEl.innerHTML = 'Trait aux <strong>Blancs</strong>';
  updateClocks(); render();
}

newGameBtn.addEventListener('click', newGame);
Object.values(opt).forEach((el) => el.addEventListener('change', () => {
  if (el === opt.koth || el === opt.clock || el === opt.sound) { updateClocks(); render(); }
  else newGame();
}));
newGame();
