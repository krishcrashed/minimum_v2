import {
  createGame,
  startRound,
  advanceDeal,
  toggleCardSelection,
  executeTurn,
  callMinimum,
  advanceAfterReveal,
  getAiAction,
  getCurrentPlayer,
  PHASE,
  TOTAL_ROUNDS,
} from './engine.js';
import {
  renderOpponents,
  renderPlayerHand,
  renderJoker,
  renderDiscard,
  renderScoreboard,
  updateHeader,
  updateTurnIndicator,
  updatePlayerStats,
  updateActionBar,
  showToast,
  showRoundReveal,
  showGameEnd,
  createCardElement,
} from './ui.js';
import { aiTurnDelay } from './ai.js';

// DOM refs
const opponentsEl = document.getElementById('opponents');
const playerHandEl = document.getElementById('playerHand');
const jokerSlot = document.getElementById('jokerSlot');
const discardSlot = document.getElementById('discardSlot');
const drawCount = document.getElementById('drawCount');
const scoreboardEl = document.getElementById('scoreboard');
const roundBadge = document.getElementById('roundBadge');
const cardsBadge = document.getElementById('cardsBadge');
const turnIndicator = document.getElementById('turnIndicator');
const handTotalEl = document.getElementById('handTotal');
const playerScoreEl = document.getElementById('playerScore');
const actionHint = document.getElementById('actionHint');
const btnDiscardDraw = document.getElementById('btnDiscardDraw');
const btnDiscardTake = document.getElementById('btnDiscardTake');
const btnMinimum = document.getElementById('btnMinimum');
const roundOverlay = document.getElementById('roundOverlay');
const startOverlay = document.getElementById('startOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayContent = document.getElementById('overlayContent');
const overlayBtn = document.getElementById('overlayBtn');
const btnStart = document.getElementById('btnStart');
const playerCountSelect = document.getElementById('playerCount');
const toastContainer = document.getElementById('toastContainer');

let game = createGame(4);
let dealingTimer = null;
let aiTimer = null;
let busy = false;

function render() {
  if (game.phase === PHASE.DEALING) return;

  renderOpponents(opponentsEl, game);
  renderPlayerHand(playerHandEl, game, onCardClick);
  renderJoker(jokerSlot, game);
  renderDiscard(discardSlot, game);
  drawCount.textContent = game.drawPile?.length ?? 0;
  renderScoreboard(scoreboardEl, game);
  updateHeader(roundBadge, cardsBadge, game);
  updateTurnIndicator(turnIndicator, game);
  updatePlayerStats(handTotalEl, playerScoreEl, game);
  updateActionBar(
    { btnDiscardDraw, btnDiscardTake, btnMinimum },
    actionHint,
    game
  );
}

function renderDealStep() {
  renderOpponents(opponentsEl, game);
  renderPlayerHand(playerHandEl, game, onCardClick);
  drawCount.textContent = game.drawPile?.length ?? 0;
  updateHeader(roundBadge, cardsBadge, game);
  updateTurnIndicator(turnIndicator, game);
  updateActionBar(
    { btnDiscardDraw, btnDiscardTake, btnMinimum },
    actionHint,
    game
  );
}

function onCardClick(cardId) {
  if (busy) return;
  game = toggleCardSelection(game, cardId);
  render();
}

async function runDealAnimation() {
  busy = true;
  const order = game.dealOrder;

  for (let i = 0; i < order.length; i++) {
    game = { ...game, dealIndex: i + 1 };
    renderDealStep();
    await sleep(130);
  }

  await sleep(280);
  game = { ...game, jokerRevealed: true };
  renderJoker(jokerSlot, game, { animate: true });
  showToast(toastContainer, `Joker rank: ${game.jokerRank} — all ${game.jokerRank}s are worth 0`);

  await sleep(500);
  game = { ...game, discardRevealed: true };
  renderDiscard(discardSlot, game, { animate: true });

  await sleep(350);
  game = advanceDeal(game);
  busy = false;
  render();
  scheduleAi();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function beginRound() {
  clearTimers();
  game = startRound(game);
  jokerSlot.innerHTML = '<span class="placeholder">—</span>';
  discardSlot.innerHTML = '';
  renderDealStep();
  runDealAnimation();
}

function clearTimers() {
  if (dealingTimer) clearTimeout(dealingTimer);
  if (aiTimer) clearTimeout(aiTimer);
}

function scheduleAi() {
  if (game.phase !== PHASE.PLAYING) return;
  const player = getCurrentPlayer(game);
  if (player.isHuman) return;

  aiTimer = setTimeout(() => {
    runAiTurn();
  }, aiTurnDelay());
}

async function runAiTurn() {
  if (game.phase !== PHASE.PLAYING || busy) return;
  busy = true;

  const player = getCurrentPlayer(game);
  const action = getAiAction(game);

  if (action.action === 'minimum') {
    showToast(toastContainer, `${player.name} calls Minimum!`);
    await sleep(600);
    game = callMinimum(game);
    busy = false;
    render();
    showRoundReveal(roundOverlay, overlayTitle, overlayContent, overlayBtn, game);
    return;
  }

  game = { ...game, selectedCardIds: new Set(action.cardIds) };
  render();

  await sleep(400);
  game = executeTurn(game, { action: 'play', drawFrom: action.drawFrom });

  const last = game.lastAction;
  if (last) {
    const names = last.discarded.map((c) => c.rank).join(', ');
    const src = last.drawFrom === 'discard' ? 'discard pile' : 'draw pile';
    showToast(toastContainer, `${player.name} discards ${names}, draws from ${src}`);
  }

  busy = false;
  render();
  scheduleAi();
}

function humanPlay(drawFrom) {
  if (busy || game.phase !== PHASE.PLAYING || game.currentPlayerIndex !== 0) return;
  busy = true;

  game = executeTurn(game, { action: 'play', drawFrom });
  busy = false;
  render();
  scheduleAi();
}

function humanCallMinimum() {
  if (busy || game.phase !== PHASE.PLAYING || game.currentPlayerIndex !== 0) return;
  busy = true;
  showToast(toastContainer, 'You call Minimum!');
  game = callMinimum(game);
  busy = false;
  render();
  setTimeout(() => {
    showRoundReveal(roundOverlay, overlayTitle, overlayContent, overlayBtn, game);
  }, 500);
}

function onOverlayContinue() {
  roundOverlay.classList.add('hidden');
  roundOverlay.classList.remove('reveal-overlay');

  if (game.phase === PHASE.GAME_END) {
    startOverlay.classList.remove('hidden');
    game = createGame(parseInt(playerCountSelect.value, 10));
    render();
    return;
  }

  if (game.phase === PHASE.REVEAL) {
    game = advanceAfterReveal(game);

    if (game.phase === PHASE.GAME_END) {
      showGameEnd(roundOverlay, overlayTitle, overlayContent, overlayBtn, game);
      return;
    }

    beginRound();
  }
}

// Events
btnStart.addEventListener('click', () => {
  const count = parseInt(playerCountSelect.value, 10);
  game = createGame(count);
  startOverlay.classList.add('hidden');
  beginRound();
});

btnDiscardDraw.addEventListener('click', () => humanPlay('draw'));
btnDiscardTake.addEventListener('click', () => humanPlay('discard'));
btnMinimum.addEventListener('click', () => humanCallMinimum());
overlayBtn.addEventListener('click', onOverlayContinue);

// Initial render
render();
