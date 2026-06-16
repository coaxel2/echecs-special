// ===== Échecs Spécial — moteur complet + UI, thèmes, IA, modes, power-ups =====

const SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { k: 'R', q: 'D', r: 'T', b: 'F', n: 'C', p: '' };
const POWER_ICON = { mushroom: '🍄', bolt: '⚡', bomb: '💣', star: '🌟' };
const POWERS_COMMON = ['mushroom', 'bolt', 'bomb'];
const STAR_CHANCE = 0.07, SPAWN_CHANCE = 0.15, MAX_POWER_TILES = 4;
const pickPowerType = () => (Math.random() < STAR_CHANCE ? 'star' : POWERS_COMMON[Math.floor(Math.random() * 3)]);

const $ = (id) => document.getElementById(id);

// ===== Paramètres (persistés dans localStorage) =====
const SKEY = 'echecs-special-v1';
const DEFAULTS = { theme: 'classic', pieces: 'classic', opponent: '2p', ailevel: 3, side: 'w', clock: 300, koth: false, atomic: false, chess960: false, powerups: false, coords: true, sound: true, highlight: true };
let S = loadSettings();
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; } }
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
function applySettings() {
  document.body.dataset.theme = S.theme;
  document.body.dataset.pieces = S.pieces;
  $('clock-w').classList.toggle('hidden', S.clock === 0);
  $('clock-b').classList.toggle('hidden', S.clock === 0);
}

// ===== État du jeu =====
let board, turn, selected, legalMoves, gameOver, captured, enPassant, history, lastMove, powerTiles, pendingPromo;
let clocks, clockTimer, undoStack, orientation, aiColor, hintMove;

const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isHill = (r, c) => (r === 3 || r === 4) && (c === 3 || c === 4);
const clone = (b) => b.map((row) => row.map((p) => (p ? { ...p } : null)));
const other = (col) => (col === 'w' ? 'b' : 'w');

function backRankStandard() { return ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']; }
function backRank960() {
  let r;
  do { r = ['r','n','b','q','k','b','n','r']; for (let i = 7; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; } } while (!valid960(r));
  return r;
}
function valid960(r) {
  const b = r.map((p,i)=>p==='b'?i:-1).filter(i=>i>=0);
  if (b.length!==2 || (b[0]%2)===(b[1]%2)) return false;
  const k = r.indexOf('k'), rk = r.map((p,i)=>p==='r'?i:-1).filter(i=>i>=0);
  return rk.length===2 && k>rk[0] && k<rk[1];
}
function initialBoard() {
  const back = S.chess960 ? backRank960() : backRankStandard();
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) { b[0][c]={type:back[c],color:'b',moved:false}; b[1][c]={type:'p',color:'b',moved:false}; b[6][c]={type:'p',color:'w',moved:false}; b[7][c]={type:back[c],color:'w',moved:false}; }
  return b;
}

// ===== Règles =====
function isAttacked(b, r, c, by) { for (let i=0;i<8;i++) for (let j=0;j<8;j++){ const p=b[i][j]; if (p&&p.color===by&&attacks(b,i,j,r,c)) return true; } return false; }
function attacks(b, i, j, r, c) {
  const p=b[i][j], dr=r-i, dc=c-j;
  switch (p.type) {
    case 'p': { const d=p.color==='w'?-1:1; return dr===d && Math.abs(dc)===1; }
    case 'n': return (Math.abs(dr)===1&&Math.abs(dc)===2)||(Math.abs(dr)===2&&Math.abs(dc)===1);
    case 'k': return Math.abs(dr)<=1&&Math.abs(dc)<=1&&(dr||dc);
    case 'b': if (Math.abs(dr)!==Math.abs(dc)||!dr) return false; return clearPath(b,i,j,r,c);
    case 'r': if ((dr&&dc)||(!dr&&!dc)) return false; return clearPath(b,i,j,r,c);
    case 'q': if (!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc))||(!dr&&!dc)) return false; return clearPath(b,i,j,r,c);
  }
  return false;
}
function clearPath(b, i, j, r, c) { const sr=Math.sign(r-i), sc=Math.sign(c-j); let x=i+sr,y=j+sc; while (x!==r||y!==c){ if (b[x][y]) return false; x+=sr; y+=sc; } return true; }
function pseudoMoves(b, r, c, ep) {
  const p=b[r][c]; if (!p) return [];
  const mv=[]; const push=(nr,nc,sp)=>mv.push({r:nr,c:nc,special:sp});
  const slide=(dirs)=>{ for (const [dr,dc] of dirs){ let nr=r+dr,nc=c+dc; while (inB(nr,nc)){ const t=b[nr][nc]; if (!t) push(nr,nc); else { if (t.color!==p.color) push(nr,nc); break; } nr+=dr; nc+=dc; } } };
  switch (p.type) {
    case 'p': { const d=p.color==='w'?-1:1, st=p.color==='w'?6:1;
      if (inB(r+d,c)&&!b[r+d][c]) { push(r+d,c,(r+d===0||r+d===7)?'promo':null); if (r===st&&!b[r+2*d][c]) push(r+2*d,c,'double'); }
      for (const dc of [-1,1]) { const nr=r+d,nc=c+dc; if (!inB(nr,nc)) continue; if (b[nr][nc]&&b[nr][nc].color!==p.color) push(nr,nc,(nr===0||nr===7)?'promo':null); else if (ep&&ep.r===nr&&ep.c===nc) push(nr,nc,'enpassant'); }
      break; }
    case 'n': for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const nr=r+dr,nc=c+dc; if (inB(nr,nc)&&(!b[nr][nc]||b[nr][nc].color!==p.color)) push(nr,nc); } break;
    case 'b': slide([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case 'r': slide([[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'q': slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'k': {
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++){ if (!dr&&!dc) continue; const nr=r+dr,nc=c+dc; if (inB(nr,nc)&&(!b[nr][nc]||b[nr][nc].color!==p.color)) push(nr,nc); }
      if (!p.moved && !isAttacked(b,r,c,other(p.color))) {
        const rk=b[r][7]; if (rk&&rk.type==='r'&&!rk.moved&&!b[r][5]&&!b[r][6]&&!isAttacked(b,r,5,other(p.color))&&!isAttacked(b,r,6,other(p.color))) push(r,6,'castle-k');
        const rq=b[r][0]; if (rq&&rq.type==='r'&&!rq.moved&&!b[r][1]&&!b[r][2]&&!b[r][3]&&!isAttacked(b,r,2,other(p.color))&&!isAttacked(b,r,3,other(p.color))) push(r,2,'castle-q');
      }
      break; }
  }
  return mv;
}
function simulate(b, from, to, ep) {
  const nb=clone(b); const p=nb[from.r][from.c];
  nb[to.r][to.c]=p; nb[from.r][from.c]=null;
  if (to.special==='enpassant') nb[from.r][to.c]=null;
  if (to.special==='promo') p.type='q';
  if (to.special==='castle-k') { nb[from.r][5]=nb[from.r][7]; nb[from.r][7]=null; }
  if (to.special==='castle-q') { nb[from.r][3]=nb[from.r][0]; nb[from.r][0]=null; }
  return nb;
}
function kingInCheck(b, color) { for (let i=0;i<8;i++) for (let j=0;j<8;j++) if (b[i][j]&&b[i][j].type==='k'&&b[i][j].color===color) return isAttacked(b,i,j,other(color)); return false; }
function legalOn(b, r, c, ep) { const p=b[r][c]; if (!p) return []; return pseudoMoves(b,r,c,ep).filter(m=>!kingInCheck(simulate(b,{r,c},m,ep),p.color)); }
function allLegalOn(b, color, ep) { const out=[]; for (let i=0;i<8;i++) for (let j=0;j<8;j++) if (b[i][j]&&b[i][j].color===color) for (const m of legalOn(b,i,j,ep)) out.push({from:{r:i,c:j},to:m}); return out; }
const legalFrom = (r,c) => legalOn(board, r, c, enPassant);
const allLegal = (color) => allLegalOn(board, color, enPassant);

// ===== IA (minimax alpha-bêta, évalue côté Noirs) =====
function evaluate(b) { let s=0; for (let i=0;i<8;i++) for (let j=0;j<8;j++){ const p=b[i][j]; if (!p) continue; const v=VALUE[p.type]*100+(3.5-Math.abs(i-3.5))+(3.5-Math.abs(j-3.5)); s+=(p.color==='b'?1:-1)*v; } return s; }
const capScore = (b,m) => (b[m.to.r][m.to.c] ? VALUE[b[m.to.r][m.to.c].type] : 0);
function minimax(b, depth, alpha, beta, color) {
  const moves = allLegalOn(b, color, null);
  if (!moves.length) return kingInCheck(b,color) ? (color==='b'?-1e6-depth:1e6+depth) : 0;
  if (depth===0) return evaluate(b);
  moves.sort((a,c)=>capScore(b,c)-capScore(b,a));
  if (color==='b') { let best=-Infinity; for (const m of moves){ best=Math.max(best,minimax(simulate(b,m.from,m.to,null),depth-1,alpha,beta,'w')); alpha=Math.max(alpha,best); if (alpha>=beta) break; } return best; }
  let best=Infinity; for (const m of moves){ best=Math.min(best,minimax(simulate(b,m.from,m.to,null),depth-1,alpha,beta,'b')); beta=Math.min(beta,best); if (alpha>=beta) break; } return best;
}
function bestMove(color, depth) {
  const moves = allLegalOn(board, color, enPassant);
  if (!moves.length) return null;
  moves.sort((a,b)=>capScore(board,b)-capScore(board,a));
  let best=moves[0], bestV = color==='b' ? -Infinity : Infinity;
  for (const m of moves) {
    const v = minimax(simulate(board,m.from,m.to,enPassant), depth, -Infinity, Infinity, other(color)) + (Math.random()*0.5-0.25);
    if (color==='b' ? v>bestV : v<bestV) { bestV=v; best=m; }
  }
  return best;
}
function aiMove() { if (gameOver) return; const m = bestMove(aiColor, Math.max(0, S.ailevel - 1)); if (m) play(m.from, m.to, 'q'); }

// ===== Power-ups =====
function spawnPower() {
  const empty=[]; for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (!board[r][c]&&!powerTiles.some(t=>t.r===r&&t.c===c)) empty.push({r,c});
  if (!empty.length) return;
  const cell=empty[Math.floor(Math.random()*empty.length)];
  powerTiles.push({ r: cell.r, c: cell.c, type: pickPowerType() });
}
function maybeSpawnPower() { if (!S.powerups || powerTiles.length>=MAX_POWER_TILES) return; if (Math.random()<SPAWN_CHANCE) spawnPower(); }
function applyPower(type, color, r, c) {
  const enemy=other(color), targets=[];
  for (let i=0;i<8;i++) for (let j=0;j<8;j++) if (board[i][j]&&board[i][j].color===enemy&&board[i][j].type!=='k') targets.push({i,j});
  const zap=(t)=>{ if (t){ captured[color].push(board[t.i][t.j]); board[t.i][t.j]=null; } };
  const rand=(a)=>a[Math.floor(Math.random()*a.length)];
  let replay=false, msg='';
  if (type==='mushroom') { replay=true; msg='🍄 Champignon — tu rejoues !'; }
  else if (type==='bolt') { zap(rand(targets)); msg='⚡ Éclair — pièce foudroyée !'; }
  else if (type==='bomb') { for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++){ const nr=r+dr,nc=c+dc; if (inB(nr,nc)&&board[nr][nc]&&board[nr][nc].color===enemy&&board[nr][nc].type!=='k') zap({i:nr,j:nc}); } msg='💣 Bob-omb — explosion !'; }
  else if (type==='star') { replay=true; zap(rand(targets)); msg='🌟 Étoile — rejoue + foudroie !'; }
  beep(720,0.09); $('status').textContent=msg;
  return replay;
}

// ===== Affichage =====
function dispToBoard(dr, dc) { return orientation === 'w' ? { r: dr, c: dc } : { r: 7 - dr, c: 7 - dc }; }
function render() {
  boardEl_innerClear();
  const boardEl = $('board');
  const checkColor = kingInCheck(board, turn) ? turn : null;
  for (let dr=0; dr<8; dr++) for (let dc=0; dc<8; dc++) {
    const { r, c } = dispToBoard(dr, dc);
    const cell = document.createElement('div');
    cell.className = 'cell ' + ((r + c) % 2 ? 'dark' : 'light');
    if (S.koth && isHill(r,c)) cell.classList.add('hill');
    if (lastMove && ((lastMove.from.r===r&&lastMove.from.c===c)||(lastMove.to.r===r&&lastMove.to.c===c))) cell.classList.add('last');
    if (selected && selected.r===r && selected.c===c) cell.classList.add('selected');
    if (hintMove && ((hintMove.from.r===r&&hintMove.from.c===c)||(hintMove.to.r===r&&hintMove.to.c===c))) cell.classList.add('hint');
    const lm = legalMoves.find(m=>m.r===r&&m.c===c);
    if (lm && S.highlight) cell.classList.add(board[r][c]||lm.special==='enpassant' ? 'capture' : 'move');
    const pt = powerTiles.find(t=>t.r===r&&t.c===c);
    if (pt) cell.classList.add('power');
    const p = board[r][c];
    if (p) {
      const span=document.createElement('span');
      span.className='piece '+p.color+(checkColor===p.color&&p.type==='k'?' check':'')+(lastMove&&lastMove.to.r===r&&lastMove.to.c===c?' moved':'');
      span.textContent=SYMBOLS[p.color][p.type]; cell.appendChild(span);
    } else if (pt) { const s=document.createElement('span'); s.className='power-icon'; s.textContent=POWER_ICON[pt.type]; cell.appendChild(s); }
    if (S.coords) {
      if (dc===0) { const s=document.createElement('span'); s.className='coord rank'; s.textContent=8-r; cell.appendChild(s); }
      if (dr===7) { const s=document.createElement('span'); s.className='coord file'; s.textContent='abcdefgh'[c]; cell.appendChild(s); }
    }
    cell.addEventListener('click', () => onClick(r, c));
    boardEl.appendChild(cell);
  }
  $('captured-by-white').textContent = captured.w.map(x=>SYMBOLS[x.color][x.type]).join(' ');
  $('captured-by-black').textContent = captured.b.map(x=>SYMBOLS[x.color][x.type]).join(' ');
  renderAdvantage();
  $('btn-undo').disabled = undoStack.length === 0;
}
function boardEl_innerClear() { $('board').innerHTML = ''; }
function renderAdvantage() {
  let w=0, b=0;
  for (let i=0;i<8;i++) for (let j=0;j<8;j++){ const p=board[i][j]; if (!p) continue; if (p.color==='w') w+=VALUE[p.type]; else b+=VALUE[p.type]; }
  $('adv-w').textContent = w>b ? '+'+(w-b) : '';
  $('adv-b').textContent = b>w ? '+'+(b-w) : '';
}

// ===== Interaction =====
function onClick(r, c) {
  if (gameOver || pendingPromo) return;
  if (S.opponent==='ai' && turn===aiColor) return; // pas la main pendant le tour de l'IA
  if (online.active && turn !== online.myColor) return; // en ligne : seulement à ton tour
  hintMove = null;
  const move = legalMoves.find(m=>m.r===r&&m.c===c);
  if (selected && move) return play(selected, move);
  const p = board[r][c];
  if (p && p.color===turn) { selected={r,c}; legalMoves=legalFrom(r,c); } else { selected=null; legalMoves=[]; }
  render();
}

function snapshot() { return { board: clone(board), turn, enPassant: enPassant?{...enPassant}:null, captured:{w:[...captured.w],b:[...captured.b]}, history:[...history], lastMove:lastMove?{from:{...lastMove.from},to:{...lastMove.to}}:null, powerTiles:powerTiles.map(t=>({...t})), clocks:{...clocks} }; }
function restore(s) { board=s.board; turn=s.turn; enPassant=s.enPassant; captured=s.captured; history=s.history; lastMove=s.lastMove; powerTiles=s.powerTiles; clocks=s.clocks; gameOver=false; selected=null; legalMoves=[]; hintMove=null; $('banner').classList.remove('show'); $('status').textContent=''; renderHistory(); }

function play(from, to, promoChoice, remote) {
  const p = board[from.r][from.c];
  if (to.special==='promo' && !promoChoice && !(S.opponent==='ai' && p.color===aiColor)) { pendingPromo={from,to}; showPromo(p.color); return; }
  if (online.active && !remote) { try { online.conn.send({ type:'move', from:{r:from.r,c:from.c}, to:{r:to.r,c:to.c,special:to.special}, promo: promoChoice||null }); } catch(e){} }
  undoStack.push(snapshot());

  const cap = board[to.r][to.c] || (to.special==='enpassant' ? board[from.r][to.c] : null);
  let notation = NAME[p.type] + (cap ? (p.type==='p'?'abcdefgh'[from.c]:'')+'x' : '') + 'abcdefgh'[to.c] + (8-to.r);
  if (to.special==='castle-k') notation='O-O';
  if (to.special==='castle-q') notation='O-O-O';

  board[to.r][to.c]=p; board[from.r][from.c]=null; p.moved=true;
  if (to.special==='enpassant') board[from.r][to.c]=null;
  if (to.special==='castle-k') { board[from.r][5]=board[from.r][7]; board[from.r][7]=null; board[from.r][5].moved=true; }
  if (to.special==='castle-q') { board[from.r][3]=board[from.r][0]; board[from.r][0]=null; board[from.r][3].moved=true; }
  if (to.special==='promo') { p.type=promoChoice||'q'; notation+='='+NAME[p.type]; }
  if (cap) { captured[p.color].push(cap); beep(180,0.06); } else beep(330,0.04);

  enPassant = (to.special==='double') ? { r:(from.r+to.r)/2, c:to.c } : null;

  let atomicKing=null;
  if (S.atomic && cap) {
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++){ const nr=to.r+dr,nc=to.c+dc; if (!inB(nr,nc)) continue; const q=board[nr][nc]; if (q&&(q.type!=='p'||(nr===to.r&&nc===to.c))){ if (q.type==='k') atomicKing=q.color; board[nr][nc]=null; } }
    board[to.r][to.c]=null; beep(90,0.12);
  }

  let replay=false;
  const ti=powerTiles.findIndex(t=>t.r===to.r&&t.c===to.c);
  if (ti>=0 && !atomicKing) { const t=powerTiles[ti]; powerTiles.splice(ti,1); replay=applyPower(t.type,p.color,to.r,to.c); }

  lastMove={from,to}; selected=null; legalMoves=[];

  if (atomicKing) return end(`${atomicKing==='w'?'Les Noirs':'Les Blancs'} gagnent ! 💥 Roi pulvérisé`, notation);
  if (S.koth && p.type==='k' && isHill(to.r,to.c)) return end(`${p.color==='w'?'Les Blancs':'Les Noirs'} gagnent ! 👑 Roi au sommet`, notation);

  if (!replay) { turn=other(turn); maybeSpawnPower(); }

  const moves=allLegal(turn), inCheck=kingInCheck(board,turn);
  if (!moves.length) { addHistory(notation+(inCheck?'#':'')); render(); return inCheck ? end(`Échec et mat ! ${turn==='w'?'Les Noirs':'Les Blancs'} gagnent 🏆`) : end('Pat — partie nulle 🤝'); }
  addHistory(notation+(inCheck?'+':''));
  $('turn').innerHTML = `Trait aux <strong>${turn==='w'?'Blancs':'Noirs'}</strong>`+(inCheck?' <span class="chk">échec !</span>':'');
  render(); switchClock();
  if (S.opponent==='ai' && turn===aiColor && !gameOver) setTimeout(aiMove, 320);
}

// ===== Promotion =====
function showPromo(color) {
  const el=$('promo'); el.innerHTML='';
  for (const t of ['q','r','b','n']) { const b=document.createElement('button'); b.textContent=SYMBOLS[color][t]; b.className='promo-btn '+color; b.addEventListener('click',()=>{ const pp=pendingPromo; pendingPromo=null; el.classList.remove('show'); play(pp.from,pp.to,t); }); el.appendChild(b); }
  el.classList.add('show');
}

// ===== Indice / annuler / retourner =====
function doHint() {
  if (gameOver || (S.opponent==='ai'&&turn===aiColor)) return;
  const m = bestMove(turn, 1);
  if (m) { hintMove = m; render(); $('status').textContent = '💡 Indice affiché'; }
}
function doUndo() {
  if (onlineGame || !undoStack.length) return;
  clearInterval(clockTimer);
  restore(undoStack.pop());
  if (S.opponent==='ai' && turn===aiColor && undoStack.length) restore(undoStack.pop());
  $('turn').innerHTML = `Trait aux <strong>${turn==='w'?'Blancs':'Noirs'}</strong>`;
  render(); switchClock();
}
function doFlip() { orientation = other(orientation); render(); }

// ===== Historique / horloge / son / fin =====
function addHistory(txt) { history.push(txt); renderHistory(); }
function renderHistory() {
  const el=$('history'); el.innerHTML='';
  for (let i=0;i<history.length;i+=2) { const li=document.createElement('div'); li.className='move-row'; li.innerHTML=`<span class="num">${i/2+1}.</span> <span>${history[i]||''}</span> <span>${history[i+1]||''}</span>`; el.appendChild(li); }
  el.scrollTop=el.scrollHeight;
}
const fmt = (s) => Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
function switchClock() {
  if (S.clock===0) { updateClocks(); return; }
  clearInterval(clockTimer);
  clockTimer=setInterval(()=>{ clocks[turn]-=1; if (clocks[turn]<=0){ clocks[turn]=0; updateClocks(); return end(`Temps écoulé — ${turn==='w'?'Les Noirs':'Les Blancs'} gagnent ⏱️`); } updateClocks(); },1000);
  updateClocks();
}
function updateClocks() { $('clock-w').textContent=fmt(clocks.w); $('clock-b').textContent=fmt(clocks.b); $('clock-w').classList.toggle('active',turn==='w'&&S.clock>0&&!gameOver); $('clock-b').classList.toggle('active',turn==='b'&&S.clock>0&&!gameOver); }
let audioCtx;
function beep(freq, dur) {
  if (!S.sound) return;
  try { audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.frequency.value=freq; o.type='triangle'; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(0.08,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur); o.start(); o.stop(audioCtx.currentTime+dur); } catch (e) {}
}
function end(msg, lastNotation) { if (lastNotation) addHistory(lastNotation); gameOver=true; clearInterval(clockTimer); selected=null; legalMoves=[]; hintMove=null; $('status').textContent=msg; $('banner').textContent=msg; $('banner').classList.add('show'); updateClocks(); render(); }

// ===== Modes actifs (badges) =====
function renderModes() {
  const el=$('active-modes'); el.innerHTML='';
  const list=[];
  list.push(S.opponent==='ai' ? `🤖 IA (${['','Facile','Moyen','Difficile'][S.ailevel]})` : '👥 2 joueurs');
  if (S.koth) list.push('👑 KotH'); if (S.atomic) list.push('💥 Atomic'); if (S.chess960) list.push('🎲 Chess960'); if (S.powerups) list.push('🎁 Power-ups');
  if (S.clock>0) list.push('⏱️ '+(S.clock/60)+'min');
  list.forEach(t=>{ const s=document.createElement('span'); s.className='badge'; s.textContent=t; el.appendChild(s); });
}

// ===== Nouvelle partie =====
function newGame() {
  clearInterval(clockTimer);
  applySettings();
  board=initialBoard(); turn='w'; selected=null; legalMoves=[]; gameOver=false;
  captured={w:[],b:[]}; enPassant=null; history=[]; lastMove=null; pendingPromo=null; powerTiles=[]; undoStack=[]; hintMove=null;
  if (S.powerups) spawnPower();
  // adversaire IA : couleur de l'IA = l'inverse du camp choisi
  aiColor = S.opponent==='ai' ? other(S.side==='random' ? (Math.random()<0.5?'w':'b') : S.side) : null;
  orientation = (S.opponent==='ai' && aiColor==='w') ? 'b' : 'w'; // le joueur humain en bas
  clocks={ w:S.clock||300, b:S.clock||300 };
  $('status').textContent=''; $('banner').classList.remove('show'); $('history').innerHTML='';
  $('turn').innerHTML='Trait aux <strong>Blancs</strong>';
  renderModes(); updateClocks(); render();
  if (S.opponent==='ai' && turn===aiColor) setTimeout(aiMove, 400);
}

// ===== Écrans & modales =====
function show(id) { document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active', s.id===id)); }
function openModal(id) { $(id).classList.add('show'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m=>m.classList.remove('show')); }

// Lier les contrôles paramètres <-> S
function bindSettings() {
  const map = { 'set-theme':'theme','set-pieces':'pieces','set-opponent':'opponent','set-ailevel':'ailevel','set-side':'side','set-clock':'clock' };
  for (const [id,k] of Object.entries(map)) {
    const el=$(id); el.value=String(S[k]);
    el.addEventListener('change',()=>{ S[k] = (k==='ailevel'||k==='clock') ? parseInt(el.value,10) : el.value; saveSettings(); applySettings(); if (['opponent','side','clock','chess960'].includes(k)) newGame(); else render(); renderModes(); });
  }
  const checks = { 'set-koth':'koth','set-atomic':'atomic','set-chess960':'chess960','set-powerups':'powerups','set-coords':'coords','set-sound':'sound','set-highlight':'highlight' };
  for (const [id,k] of Object.entries(checks)) {
    const el=$(id); el.checked=!!S[k];
    el.addEventListener('change',()=>{ S[k]=el.checked; saveSettings(); if (['koth','atomic','chess960','powerups'].includes(k)) newGame(); else render(); renderModes(); });
  }
}

// ===== Multijoueur (PeerJS / WebRTC) — échecs standard, salle par code =====
const online = { active: false, peer: null, conn: null, myColor: 'w' };
let onlineGame = false;
function genCode() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function onlineReset() { try { online.conn && online.conn.close(); } catch (e) {} try { online.peer && online.peer.destroy(); } catch (e) {} online.active = false; online.peer = null; online.conn = null; }
function backToStart() { $('online-wait').classList.remove('show'); $('online-start').classList.remove('hidden'); }
function createRoom() {
  if (typeof Peer === 'undefined') { $('online-error').textContent = 'Module réseau indisponible (vérifie ta connexion).'; return; }
  onlineReset(); const code = genCode();
  $('online-error').textContent = ''; $('online-start').classList.add('hidden'); $('online-wait').classList.add('show');
  $('room-code').textContent = code; $('online-status').textContent = "⏳ En attente d'un adversaire…";
  const peer = new Peer('echq-' + code, { debug: 0 }); online.peer = peer; online.myColor = 'w';
  peer.on('connection', (conn) => { conn.on('open', () => setupConn(conn)); });
  peer.on('error', (e) => { $('online-error').textContent = e.type === 'unavailable-id' ? 'Code déjà pris, réessaie.' : 'Erreur réseau : ' + e.type; backToStart(); });
}
function joinRoom() {
  if (typeof Peer === 'undefined') { $('online-error').textContent = 'Module réseau indisponible.'; return; }
  const code = ($('join-code').value || '').trim().toUpperCase(); if (code.length < 4) { $('online-error').textContent = 'Entre le code reçu.'; return; }
  onlineReset(); $('online-error').textContent = ''; $('online-start').classList.add('hidden'); $('online-wait').classList.add('show');
  $('room-code').textContent = code; $('online-status').textContent = '🔌 Connexion…';
  const peer = new Peer({ debug: 0 }); online.peer = peer; online.myColor = 'b';
  peer.on('open', () => { const conn = peer.connect('echq-' + code, { reliable: true }); conn.on('open', () => setupConn(conn)); setTimeout(() => { if (!online.active) { $('online-error').textContent = 'Salle introuvable, vérifie le code.'; backToStart(); } }, 9000); });
  peer.on('error', (e) => { $('online-error').textContent = e.type === 'peer-unavailable' ? 'Salle introuvable, vérifie le code.' : 'Erreur réseau : ' + e.type; backToStart(); });
}
function setupConn(conn) {
  online.conn = conn; online.active = true;
  conn.on('data', (m) => { if (m && m.type === 'move') play(m.from, m.to, m.promo, true); else if (m && m.type === 'restart') startOnlineGame(); });
  conn.on('close', () => { if (!gameOver) { $('status').textContent = '⚠️ Adversaire déconnecté'; } });
  startOnlineGame();
}
function startOnlineGame() {
  onlineGame = true;
  S.koth = false; S.atomic = false; S.chess960 = false; S.powerups = false; S.opponent = '2p'; S.clock = 0; // règles standard déterministes
  closeModals(); show('game-screen'); newGame();
  orientation = online.myColor; render();
  $('turn').innerHTML = `🌐 En ligne · Trait aux <strong>Blancs</strong>`;
  const badge = $('active-modes'); badge.innerHTML = ''; const s = document.createElement('span'); s.className = 'badge live'; s.textContent = '🌐 En ligne — tu joues ' + (online.myColor === 'w' ? 'Blancs' : 'Noirs'); badge.appendChild(s);
}
function leaveOnline() { if (onlineGame) { onlineReset(); onlineGame = false; S = loadSettings(); applySettings(); } }

// ===== Boutons =====
$('btn-play').addEventListener('click', () => { leaveOnline(); show('game-screen'); newGame(); });
$('btn-online').addEventListener('click', () => { backToStart(); $('online-error').textContent=''; $('join-code').value=''; openModal('online'); });
$('btn-create').addEventListener('click', createRoom);
$('btn-join').addEventListener('click', joinRoom);
$('btn-cancel-online').addEventListener('click', () => { onlineReset(); backToStart(); });
$('btn-settings').addEventListener('click', () => openModal('settings'));
$('btn-settings2').addEventListener('click', () => openModal('settings'));
$('btn-rules').addEventListener('click', () => openModal('rules'));
$('btn-menu').addEventListener('click', () => { leaveOnline(); show('menu'); });
$('btn-newgame').addEventListener('click', () => { if (onlineGame) { try { online.conn && online.conn.send({ type: 'restart' }); } catch (e) {} startOnlineGame(); } else newGame(); });
$('btn-undo').addEventListener('click', doUndo);
$('btn-hint').addEventListener('click', doHint);
$('btn-flip').addEventListener('click', doFlip);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
document.querySelectorAll('.chip[data-opp]').forEach(b => b.addEventListener('click', () => { S.opponent = b.dataset.opp; saveSettings(); document.querySelectorAll('.chip[data-opp]').forEach(x => x.classList.toggle('sel', x === b)); $('set-opponent').value = S.opponent; }));

// Init
applySettings();
bindSettings();
document.querySelectorAll('.chip[data-opp]').forEach(b => b.classList.toggle('sel', b.dataset.opp === S.opponent));
