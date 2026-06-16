// ===== Échecs Spécial — moteur complet + variantes (HTML/CSS/JS pur) =====
// Plateau 8x8 : board[ligne][colonne] = pièce | null. Ligne 0 = haut (Noirs), 7 = bas (Blancs).
// Pièce = { type:'p|r|n|b|q|k', color:'w|b', moved:bool }.

const SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { k: 'R', q: 'D', r: 'T', b: 'F', n: 'C', p: '' }; // notation FR

// --- DOM ---
const boardEl    = document.getElementById('board');
const turnEl     = document.getElementById('turn');
const statusEl   = document.getElementById('status');
const capWhiteEl = document.getElementById('captured-by-white');
const capBlackEl = document.getElementById('captured-by-black');
const newGameBtn = document.getElementById('new-game');
const historyEl  = document.getElementById('history');
const clockWEl   = document.getElementById('clock-w');
const clockBEl   = document.getElementById('clock-b');
const promoEl    = document.getElementById('promo');
const bannerEl   = document.getElementById('banner');
const opt = {
  koth:     document.getElementById('koth'),
  atomic:   document.getElementById('atomic'),
  chess960: document.getElementById('chess960'),
  powerups: document.getElementById('powerups'),
  ai:       document.getElementById('ai'),
  clock:    document.getElementById('clock-on'),
  sound:    document.getElementById('sound'),
};

// --- État ---
let board, turn, selected, legalMoves, gameOver, captured, enPassant, history, lastMove, powerTiles, pendingPromo;
let clocks, clockTimer;

const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isHill = (r, c) => (r === 3 || r === 4) && (c === 3 || c === 4);
const clone = (b) => b.map((row) => row.map((p) => (p ? { ...p } : null)));
const other = (col) => (col === 'w' ? 'b' : 'w');
const key = (r, c) => r + ',' + c;

// --- Plateaux de départ ---
function backRankStandard() { return ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']; }
function backRank960() {
  // Position aléatoire valide : fous sur couleurs opposées, roi entre les deux tours.
  let r;
  do {
    r = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  } while (!valid960(r));
  return r;
}
function valid960(r) {
  const b = r.map((p, i) => (p === 'b' ? i : -1)).filter((i) => i >= 0);
  if (b.length !== 2 || (b[0] % 2) === (b[1] % 2)) return false;        // fous couleurs opposées
  const k = r.indexOf('k'), rooks = r.map((p, i) => (p === 'r' ? i : -1)).filter((i) => i >= 0);
  return rooks.length === 2 && k > rooks[0] && k < rooks[1];            // roi entre les tours
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

// --- Attaques (pour détecter l'échec) : la case (r,c) est-elle attaquée par `by` ? ---
function isAttacked(b, r, c, by) {
  // Pour chaque pièce de couleur `by`, voit-elle la case (r,c) ?
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const p = b[i][j];
    if (!p || p.color !== by) continue;
    if (attacks(b, i, j, r, c)) return true;
  }
  return false;
}
// est-ce que la pièce en (i,j) attaque la case (r,c) ? (attaque pure, sans roque)
function attacks(b, i, j, r, c) {
  const p = b[i][j];
  const dr = r - i, dc = c - j;
  switch (p.type) {
    case 'p': { const d = p.color === 'w' ? -1 : 1; return dr === d && Math.abs(dc) === 1; }
    case 'n': return (Math.abs(dr) === 1 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 1);
    case 'k': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr || dc);
    case 'b': if (Math.abs(dr) !== Math.abs(dc) || !dr) return false; return clearPath(b, i, j, r, c);
    case 'r': if (dr && dc) return false; if (!dr && !dc) return false; return clearPath(b, i, j, r, c);
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

// --- Coups pseudo-légaux d'une pièce (avec roque + en passant) ---
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
        if (!t) push(nr, nc);
        else { if (t.color !== p.color) push(nr, nc); break; }
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
        else if (ep && ep.r === nr && ep.c === nc) push(nr, nc, 'enpassant'); // prise en passant
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
      // Roque (si roi pas bougé, pas en échec)
      if (!p.moved && !isAttacked(b, r, c, other(p.color))) {
        // petit roque (vers la droite, colonne 7)
        const rookK = b[r][7];
        if (rookK && rookK.type === 'r' && !rookK.moved && !b[r][5] && !b[r][6] &&
            !isAttacked(b, r, 5, other(p.color)) && !isAttacked(b, r, 6, other(p.color))) push(r, 6, 'castle-k');
        // grand roque (colonne 0)
        const rookQ = b[r][0];
        if (rookQ && rookQ.type === 'r' && !rookQ.moved && !b[r][1] && !b[r][2] && !b[r][3] &&
            !isAttacked(b, r, 2, other(p.color)) && !isAttacked(b, r, 3, other(p.color))) push(r, 2, 'castle-q');
      }
      break;
    }
  }
  return mv;
}

// Applique un coup sur une COPIE (promo = dame par défaut pour la simulation) et renvoie le board résultant
function simulate(b, from, to, ep) {
  const nb = clone(b);
  const p = nb[from.r][from.c];
  nb[to.r][to.c] = p; nb[from.r][from.c] = null;
  if (to.special === 'enpassant') nb[from.r][to.c] = null;          // pion capturé en passant
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
// Coups LÉGAUX = pseudo qui ne laissent pas son roi en échec
function legalFrom(r, c) {
  const p = board[r][c]; if (!p) return [];
  return pseudoMoves(board, r, c, enPassant).filter((m) => !kingInCheck(simulate(board, { r, c }, m, enPassant), p.color));
}
function allLegal(color) {
  const out = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    if (board[i][j] && board[i][j].color === color)
      for (const m of legalFrom(i, j)) out.push({ from: { r: i, c: j }, to: m });
  return out;
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
    if (legalMoves.some((m) => m.r === r && m.c === c)) cell.classList.add(board[r][c] || (legalMoves.find(m=>m.r===r&&m.c===c)||{}).special==='enpassant' ? 'capture' : 'move');
    if (powerTiles.some((t) => t.r === r && t.c === c)) cell.classList.add('power');
    const p = board[r][c];
    if (p) {
      const span = document.createElement('span');
      span.className = 'piece ' + p.color + (checkColor === p.color && p.type === 'k' ? ' check' : '') + (lastMove && lastMove.to.r === r && lastMove.to.c === c ? ' moved' : '');
      span.textContent = SYMBOLS[p.color][p.type];
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
  if (p && p.color === turn && !(opt.ai.checked && turn === 'b')) {
    selected = { r, c }; legalMoves = legalFrom(r, c);
  } else { selected = null; legalMoves = []; }
  render();
}

function play(from, to, promoChoice) {
  const p = board[from.r][from.c];
  // Promotion : demander la pièce (sauf IA / choix fourni)
  if (to.special === 'promo' && !promoChoice && !(opt.ai.checked && p.color === 'b')) {
    pendingPromo = { from, to };
    showPromo(p.color);
    return;
  }
  const capturedPiece = board[to.r][to.c] || (to.special === 'enpassant' ? board[from.r][to.c] : null);
  let notation = NAME[p.type] + (capturedPiece ? (p.type === 'p' ? 'abcdefgh'[from.c] : '') + 'x' : '') + 'abcdefgh'[to.c] + (8 - to.r);
  if (to.special === 'castle-k') notation = 'O-O';
  if (to.special === 'castle-q') notation = 'O-O-O';

  // Effectuer le coup
  board[to.r][to.c] = p; board[from.r][from.c] = null; p.moved = true;
  if (to.special === 'enpassant') board[from.r][to.c] = null;
  if (to.special === 'castle-k') { board[from.r][5] = board[from.r][7]; board[from.r][7] = null; board[from.r][5].moved = true; }
  if (to.special === 'castle-q') { board[from.r][3] = board[from.r][0]; board[from.r][0] = null; board[from.r][3].moved = true; }
  if (to.special === 'promo') { p.type = promoChoice || 'q'; notation += '=' + NAME[p.type]; }

  if (capturedPiece) { captured[p.color].push(capturedPiece); beep(180, 0.06); } else beep(330, 0.04);

  // En passant possible au prochain coup ?
  enPassant = (to.special === 'double') ? { r: (from.r + to.r) / 2, c: to.c } : null;

  // Mode Atomic : une capture explose le voisinage (sauf pions, sauf le roi déclencheur)
  let atomicKing = null;
  if (opt.atomic.checked && capturedPiece) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = to.r + dr, nc = to.c + dc;
      if (!inB(nr, nc)) continue;
      const q = board[nr][nc];
      if (q && (q.type !== 'p' || (nr === to.r && nc === to.c))) { if (q.type === 'k') atomicKing = q.color; board[nr][nc] = null; }
    }
    board[to.r][to.c] = null; // la pièce capturante explose aussi
    beep(90, 0.12);
  }

  // Power-up : la pièce atterrit sur une case bonus → on rejoue
  let replay = false;
  const ti = powerTiles.findIndex((t) => t.r === to.r && t.c === to.c);
  if (ti >= 0 && !atomicKing) { powerTiles.splice(ti, 1); replay = true; }

  lastMove = { from, to };
  selected = null; legalMoves = [];

  // Fin par roi capturé (atomic) ou King of the Hill
  if (atomicKing) return end(`${atomicKing === 'w' ? 'Les Noirs' : 'Les Blancs'} gagnent ! 💥 Roi pulvérisé`, notation);
  if (opt.koth.checked && p.type === 'k' && isHill(to.r, to.c)) return end(`${p.color === 'w' ? 'Les Blancs' : 'Les Noirs'} gagnent ! 👑 Roi au sommet`, notation);

  // Tour suivant (sauf rejouer)
  if (!replay) turn = other(turn);

  // Échec / mat / pat
  const moves = allLegal(turn);
  const inCheck = kingInCheck(board, turn);
  if (moves.length === 0) {
    addHistory(notation + (inCheck ? '#' : ''));
    render();
    if (inCheck) return end(`Échec et mat ! ${turn === 'w' ? 'Les Noirs' : 'Les Blancs'} gagnent 🏆`);
    return end('Pat — partie nulle 🤝');
  }
  addHistory(notation + (inCheck ? '+' : ''));

  turnEl.innerHTML = `Trait aux <strong>${turn === 'w' ? 'Blancs' : 'Noirs'}</strong>` + (inCheck ? ' <span class="chk">échec !</span>' : '');
  render();
  switchClock();

  // IA joue les Noirs
  if (opt.ai.checked && turn === 'b' && !gameOver) setTimeout(aiMove, 350);
}

// --- Promotion (modale) ---
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

// --- IA simple : capture la plus rentable, sinon coup aléatoire ---
function aiMove() {
  if (gameOver) return;
  const moves = allLegal('b');
  if (!moves.length) return;
  let best = moves, bestScore = -1;
  const scored = moves.map((m) => {
    const target = board[m.to.r][m.to.c];
    let s = target ? VALUE[target.type] * 10 : 0;
    if (m.to.special === 'promo') s += 8;
    if (isHill(m.to.r, m.to.c) && opt.koth.checked) s += 5;
    s += Math.random();
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const choice = scored[0].m;
  play(choice.from, choice.to, 'q');
}

// --- Historique + horloge + son + fin ---
function addHistory(txt) {
  history.push(txt);
  const n = Math.ceil(history.length / 2);
  historyEl.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('div');
    li.className = 'move-row';
    li.innerHTML = `<span class="num">${i / 2 + 1}.</span> <span>${history[i] || ''}</span> <span>${history[i + 1] || ''}</span>`;
    historyEl.appendChild(li);
  }
  historyEl.scrollTop = historyEl.scrollHeight;
}
function fmt(s) { const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); }
function switchClock() {
  if (!opt.clock.checked) return;
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
  gameOver = true; clearInterval(clockTimer);
  selected = null; legalMoves = [];
  statusEl.textContent = msg;
  bannerEl.textContent = msg; bannerEl.classList.add('show');
  updateClocks(); render();
}

// --- Nouvelle partie ---
function newGame() {
  clearInterval(clockTimer);
  board = initialBoard();
  turn = 'w'; selected = null; legalMoves = []; gameOver = false;
  captured = { w: [], b: [] }; enPassant = null; history = []; lastMove = null; pendingPromo = null;
  powerTiles = [];
  if (opt.powerups.checked) {
    const spots = [];
    for (let r = 2; r <= 5; r++) for (let c = 0; c < 8; c++) spots.push({ r, c });
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    powerTiles = spots.slice(0, 3);
  }
  clocks = { w: 300, b: 300 };
  statusEl.textContent = '';
  bannerEl.classList.remove('show');
  historyEl.innerHTML = '';
  turnEl.innerHTML = 'Trait aux <strong>Blancs</strong>';
  updateClocks();
  render();
}

newGameBtn.addEventListener('click', newGame);
Object.values(opt).forEach((el) => el.addEventListener('change', () => {
  // koth/atomic/clock se reflètent immédiatement, les autres au reset
  if (el === opt.koth || el === opt.clock || el === opt.sound) { updateClocks(); render(); }
  else newGame();
}));
newGame();
