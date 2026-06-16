// ===== Échecs Spécial — logique du jeu (HTML/CSS/JS pur, sans dépendance) =====
// Plateau : tableau 8x8. board[ligne][colonne] = pièce ou null.
// Une pièce = { type: 'p'|'r'|'n'|'b'|'q'|'k', color: 'w'|'b' }.
// Ligne 0 = haut (Noirs), ligne 7 = bas (Blancs). Les Blancs montent (ligne -1).

const SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

// --- Références DOM ---
const boardEl   = document.getElementById('board');
const turnEl    = document.getElementById('turn');
const statusEl  = document.getElementById('status');
const capWhiteEl = document.getElementById('captured-by-white');
const capBlackEl = document.getElementById('captured-by-black');
const newGameBtn = document.getElementById('new-game');
const kothInput  = document.getElementById('koth');

// --- État du jeu ---
let board, turn, selected, legalMoves, gameOver, captured, koth;

const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isHill = (r, c) => (r === 3 || r === 4) && (c === 3 || c === 4);

function initialBoard() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'b' };
    b[1][c] = { type: 'p', color: 'b' };
    b[6][c] = { type: 'p', color: 'w' };
    b[7][c] = { type: back[c], color: 'w' };
  }
  return b;
}

// --- Génération des coups possibles d'une pièce (sans gestion de l'échec : V1) ---
function legalMovesFor(r, c) {
  const p = board[r][c];
  if (!p) return [];
  const moves = [];

  // glissement (fou, tour, dame) : avance dans une direction jusqu'à un obstacle
  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inB(nr, nc)) {
        const t = board[nr][nc];
        if (!t) { moves.push({ r: nr, c: nc }); }
        else { if (t.color !== p.color) moves.push({ r: nr, c: nc }); break; }
        nr += dr; nc += dc;
      }
    }
  };

  switch (p.type) {
    case 'p': {
      const dir = p.color === 'w' ? -1 : 1;
      const startRow = p.color === 'w' ? 6 : 1;
      if (inB(r + dir, c) && !board[r + dir][c]) {
        moves.push({ r: r + dir, c });
        if (r === startRow && !board[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c });
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inB(nr, nc) && board[nr][nc] && board[nr][nc].color !== p.color)
          moves.push({ r: nr, c: nc });
      }
      break;
    }
    case 'n': {
      const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of jumps) {
        const nr = r + dr, nc = c + dc;
        if (!inB(nr, nc)) continue;
        const t = board[nr][nc];
        if (!t || t.color !== p.color) moves.push({ r: nr, c: nc });
      }
      break;
    }
    case 'b': slide([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case 'r': slide([[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'q': slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'k': {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (!inB(nr, nc)) continue;
          const t = board[nr][nc];
          if (!t || t.color !== p.color) moves.push({ r: nr, c: nc });
        }
      break;
    }
  }
  return moves;
}

// --- Affichage ---
function render() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (koth && isHill(r, c)) cell.classList.add('hill');
      if (selected && selected.r === r && selected.c === c) cell.classList.add('selected');
      if (legalMoves.some((m) => m.r === r && m.c === c))
        cell.classList.add(board[r][c] ? 'capture' : 'move');

      const p = board[r][c];
      if (p) {
        const span = document.createElement('span');
        span.className = 'piece ' + p.color;
        span.textContent = SYMBOLS[p.color][p.type];
        cell.appendChild(span);
      }
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
  capWhiteEl.textContent = captured.w.map((pc) => SYMBOLS[pc.color][pc.type]).join(' ');
  capBlackEl.textContent = captured.b.map((pc) => SYMBOLS[pc.color][pc.type]).join(' ');
}

// --- Interaction ---
function onCellClick(r, c) {
  if (gameOver) return;
  const targetMove = legalMoves.some((m) => m.r === r && m.c === c);
  if (selected && targetMove) { makeMove(selected, { r, c }); return; }

  const p = board[r][c];
  if (p && p.color === turn) {
    selected = { r, c };
    legalMoves = legalMovesFor(r, c);
  } else {
    selected = null;
    legalMoves = [];
  }
  render();
}

function makeMove(from, to) {
  const p = board[from.r][from.c];
  const target = board[to.r][to.c];

  if (target) {
    captured[p.color].push(target);
    if (target.type === 'k') {
      board[to.r][to.c] = p;
      board[from.r][from.c] = null;
      return endGame(`${p.color === 'w' ? 'Les Blancs' : 'Les Noirs'} gagnent ! Roi capturé 🏆`);
    }
  }

  board[to.r][to.c] = p;
  board[from.r][from.c] = null;

  // Promotion : un pion qui atteint la dernière rangée devient dame
  if (p.type === 'p' && (to.r === 0 || to.r === 7)) p.type = 'q';

  // Variante King of the Hill : roi au centre = victoire immédiate
  if (koth && p.type === 'k' && isHill(to.r, to.c))
    return endGame(`${p.color === 'w' ? 'Les Blancs' : 'Les Noirs'} gagnent ! Roi au sommet 👑`);

  selected = null;
  legalMoves = [];
  turn = turn === 'w' ? 'b' : 'w';
  turnEl.innerHTML = `Trait aux <strong>${turn === 'w' ? 'Blancs' : 'Noirs'}</strong>`;
  render();
}

function endGame(msg) {
  gameOver = true;
  selected = null;
  legalMoves = [];
  statusEl.textContent = msg;
  render();
}

function newGame() {
  board = initialBoard();
  turn = 'w';
  selected = null;
  legalMoves = [];
  gameOver = false;
  captured = { w: [], b: [] };
  statusEl.textContent = '';
  turnEl.innerHTML = 'Trait aux <strong>Blancs</strong>';
  render();
}

// --- Branchements ---
newGameBtn.addEventListener('click', newGame);
kothInput.addEventListener('change', (e) => { koth = e.target.checked; render(); });

koth = false;
newGame();
