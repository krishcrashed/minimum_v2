import { cardValue, handTotal, isRed } from './cards.js';
import { cardsPerRound, TOTAL_ROUNDS, getDiscardTop, PHASE } from './engine.js';

function visibleCardCount(game, playerIndex) {
  if (game.phase !== PHASE.DEALING || !game.dealOrder) return null;
  return game.dealOrder
    .slice(0, game.dealIndex)
    .filter((d) => d.playerIndex === playerIndex).length;
}

export function createCardElement(card, jokerRank, options = {}) {
  const {
    faceDown = false,
    selected = false,
    interactive = false,
    small = false,
    animate = null,
    onClick = null,
    isIndicator = false,
  } = options;

  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.cardId = card.id;

  if (faceDown) {
    el.classList.add('card-back');
    if (animate) el.classList.add(animate);
    return el;
  }

  if (selected) el.classList.add('selected');
  if (interactive) el.classList.add('interactive');
  if (animate) el.classList.add(animate);
  if (isRed(card)) el.classList.add('red');

  const isJoker = !isIndicator && jokerRank && card.rank === jokerRank;
  if (isJoker) el.classList.add('joker-wild');

  const face = document.createElement('div');
  face.className = `card-face${isRed(card) ? ' red' : ''}`;

  const top = document.createElement('div');
  top.className = 'card-corner top';
  top.innerHTML = `<span class="card-rank">${card.rank}</span><span class="card-suit-sm">${card.suit}</span>`;

  const center = document.createElement('div');
  center.className = 'card-center';
  center.textContent = card.suit;

  const bottom = document.createElement('div');
  bottom.className = 'card-corner bottom';
  bottom.innerHTML = `<span class="card-rank">${card.rank}</span><span class="card-suit-sm">${card.suit}</span>`;

  face.append(top, center, bottom);
  el.appendChild(face);

  if (isJoker) {
    const badge = document.createElement('span');
    badge.className = 'joker-value';
    badge.textContent = '0';
    badge.setAttribute('aria-hidden', 'true');
    el.appendChild(badge);
  }

  if (onClick) {
    el.addEventListener('click', () => onClick(card.id));
  }

  return el;
}

export function renderOpponents(container, game) {
  container.innerHTML = '';
  const opponents = game.players.filter((p) => !p.isHuman);

  opponents.forEach((player) => {
    const idx = game.players.indexOf(player);
    const isActive = game.phase === PHASE.PLAYING && game.currentPlayerIndex === idx;

    const wrap = document.createElement('div');
    wrap.className = `opponent${isActive ? ' active' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'opponent-avatar';
    avatar.textContent = player.name[0];

    const handEl = document.createElement('div');
    handEl.className = 'opponent-hand';
    const visible = visibleCardCount(game, idx);
    const handCards = visible !== null ? player.hand.slice(0, visible) : player.hand;

    handCards.forEach((card, i) => {
      const c = createCardElement(card, game.jokerRank, {
        faceDown: game.phase !== PHASE.REVEAL && game.phase !== PHASE.ROUND_END,
      });
      if (visible !== null && i === handCards.length - 1) {
        c.classList.add('dealing');
      }
      handEl.appendChild(c);
    });

    const meta = document.createElement('div');
    meta.className = 'opponent-meta';
    const total =
      game.phase === PHASE.REVEAL
        ? `Total: ${handTotal(player.hand, game.jokerRank)}`
        : `${handCards.length} cards`;
    meta.innerHTML = `<div>${player.name}</div><div class="opponent-score">${player.score} pts · ${total}</div>`;

    wrap.append(avatar, handEl, meta);
    container.appendChild(wrap);
  });
}

export function renderPlayerHand(container, game, onCardClick) {
  container.innerHTML = '';
  const player = game.players[0];
  const canSelect = game.phase === PHASE.PLAYING && game.currentPlayerIndex === 0;
  const visible = visibleCardCount(game, 0);
  const handCards = visible !== null ? player.hand.slice(0, visible) : player.hand;

  handCards.forEach((card, i) => {
    const el = createCardElement(card, game.jokerRank, {
      selected: game.selectedCardIds.has(card.id),
      interactive: canSelect,
      onClick: canSelect ? onCardClick : null,
    });
    if (visible !== null && i === handCards.length - 1) {
      el.classList.add('dealing');
    }
    container.appendChild(el);
  });
}

export function renderJoker(slot, game, { animate = false } = {}) {
  if (!game.jokerCard) {
    slot.innerHTML = '<span class="placeholder">—</span>';
    return;
  }

  const existing = slot.querySelector(`[data-card-id="${game.jokerCard.id}"]`);
  if (existing) return;

  slot.innerHTML = '';
  const el = createCardElement(game.jokerCard, game.jokerRank, {
    animate: animate ? 'joker-reveal' : null,
    isIndicator: true,
  });
  slot.appendChild(el);
}

export function renderDiscard(slot, game, { animate = false } = {}) {
  const top = getDiscardTop(game);
  if (!top) {
    slot.innerHTML = '';
    return;
  }

  const existing = slot.querySelector('.card');
  if (existing?.dataset.cardId === top.id) return;

  slot.innerHTML = '';
  const el = createCardElement(top, game.jokerRank, {
    animate: animate ? 'joker-reveal' : null,
  });
  slot.appendChild(el);
}

export function renderScoreboard(container, game) {
  container.innerHTML = '<h3>Scores</h3>';
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const leaderScore = sorted[0]?.score;

  sorted.forEach((p) => {
    const row = document.createElement('div');
    row.className = `score-row${p.isHuman ? ' human' : ''}${p.score === leaderScore ? ' leader' : ''}`;
    row.innerHTML = `<span class="score-name">${p.name}</span><span class="score-val">${p.score}</span>`;
    container.appendChild(row);
  });

  if (game.roundHistory.length > 0) {
    const div = document.createElement('div');
    div.className = 'score-divider';
    container.appendChild(div);

    const hist = document.createElement('div');
    hist.className = 'round-history';
    hist.innerHTML = '<strong style="color:var(--gold);font-size:0.75rem">History</strong>';
    game.roundHistory
      .slice()
      .reverse()
      .slice(0, 5)
      .forEach((r) => {
        const item = document.createElement('div');
        item.className = 'round-history-item';
        const note = r.callerWins ? '' : ' (caller lost!)';
        item.textContent = `R${r.round}: ${r.winner} won${note}`;
        hist.appendChild(item);
      });
    container.appendChild(hist);
  }
}

export function updateHeader(roundBadge, cardsBadge, game) {
  roundBadge.textContent = `Round ${game.round} of ${TOTAL_ROUNDS}`;
  cardsBadge.textContent = `${cardsPerRound(game.round)} cards each`;
}

export function updateTurnIndicator(el, game) {
  if (game.phase === PHASE.DEALING) {
    el.querySelector('#turnText').textContent = 'Dealing cards…';
    return;
  }
  if (game.phase === PHASE.REVEAL) {
    el.querySelector('#turnText').textContent = 'Hands revealed!';
    return;
  }
  if (game.phase === PHASE.PLAYING) {
    const p = game.players[game.currentPlayerIndex];
    el.querySelector('#turnText').textContent = p.isHuman ? 'Your turn' : `${p.name}'s turn`;
    return;
  }
  el.querySelector('#turnText').textContent = '—';
}

export function updatePlayerStats(handTotalEl, scoreEl, game) {
  const player = game.players[0];
  const total = game.jokerRank
    ? handTotal(player.hand, game.jokerRank)
    : '—';
  handTotalEl.textContent = `Total: ${total}`;
  scoreEl.textContent = `Score: ${player.score}`;
}

export function updateActionBar(buttons, hint, game) {
  const { btnDiscardDraw, btnDiscardTake, btnMinimum } = buttons;
  const isHumanTurn =
    game.phase === PHASE.PLAYING &&
    game.currentPlayerIndex === 0;
  const hasSelection = game.selectedCardIds.size > 0;
  const canTakeDiscard =
    game.discardPile.length > 0 && getDiscardTop(game);

  btnDiscardDraw.disabled = !isHumanTurn || !hasSelection;
  btnDiscardTake.disabled = !isHumanTurn || !hasSelection || !canTakeDiscard;
  btnMinimum.disabled = !isHumanTurn;

  if (!isHumanTurn) {
    hint.textContent = 'Waiting for other players…';
  } else if (!hasSelection) {
    hint.textContent = 'Select card(s) of the same rank to discard, or call Minimum.';
  } else {
    hint.textContent = `${game.selectedCardIds.size} card(s) selected — discard then draw one.`;
  }
}

export function showToast(container, message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

export function showRoundReveal(overlay, title, content, btn, game) {
  overlay.classList.remove('hidden');
  overlay.classList.add('reveal-overlay');

  const { revealData } = game;
  const w = revealData.actualWinner;
  const winTitle = w.isHuman ? 'You win!' : `${w.name} wins!`;
  title.textContent = revealData.callerWins
    ? winTitle
    : `${winTitle.replace('!', '')} — caller was wrong!`;

  content.innerHTML = '';

  const hands = document.createElement('div');
  hands.className = 'reveal-hands';

  revealData.deltas
    .sort((a, b) => a.total - b.total)
    .forEach(({ player, total, delta }) => {
      const block = document.createElement('div');
      block.className = 'result-player' + (player.id === revealData.actualWinner.id ? ' winner' : '');

      const left = document.createElement('div');
      left.innerHTML = `<strong>${player.name}</strong><br><span style="color:var(--cream-dim);font-size:0.75rem">Total: ${total}</span>`;

      const right = document.createElement('div');
      const deltaClass = delta >= 0 ? 'positive' : 'negative';
      const sign = delta >= 0 ? '+' : '';
      right.innerHTML = `<span class="points-delta ${deltaClass}">${sign}${delta}</span>`;

      const handRow = document.createElement('div');
      handRow.className = 'hand-row';
      player.hand.forEach((card) => {
        handRow.appendChild(createCardElement(card, game.jokerRank, { small: true }));
      });

      block.append(left, right);
      const wrapper = document.createElement('div');
      wrapper.className = 'reveal-player';
      wrapper.innerHTML = `<h4>${player.name} — ${total} pts ${player.id === revealData.caller.id ? '(called)' : ''}</h4>`;
      wrapper.appendChild(handRow);
      hands.appendChild(wrapper);
    });

  content.appendChild(hands);

  const summary = document.createElement('p');
  summary.style.cssText = 'font-size:0.85rem;color:var(--cream-dim);margin-bottom:1rem';
  summary.textContent = revealData.callerWins
    ? `${revealData.caller.name} called Minimum with the lowest hand.`
    : `${revealData.caller.name} called too early — loses 20 points, and ${revealData.actualWinner.name} earns the bonus.`;
  content.appendChild(summary);

  btn.textContent = game.round >= TOTAL_ROUNDS ? 'See Final Results' : `Round ${game.round + 1}`;
}

export function showGameEnd(overlay, title, content, btn, game) {
  overlay.classList.remove('hidden');
  title.textContent = 'Game Over';

  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  content.innerHTML = `
    <div class="round-result">
      ${sorted
        .map(
          (p, i) => `
        <div class="result-player ${i === 0 ? 'winner' : ''}">
          <span>${i + 1}. ${p.name}</span>
          <span class="points-delta ${p.score >= 0 ? 'positive' : 'negative'}">${p.score} pts</span>
        </div>`
        )
        .join('')}
    </div>
    <p style="color:var(--cream-dim);font-size:0.85rem">${sorted[0].name} wins the match!</p>
  `;
  btn.textContent = 'Play Again';
}

export function animateFlyingCard(fromEl, toEl, card, jokerRank, flyingContainer) {
  if (!fromEl || !toEl) return Promise.resolve();

  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();

  const fly = createCardElement(card, jokerRank);
  fly.className += ' flying-card';
  fly.style.left = `${from.left}px`;
  fly.style.top = `${from.top}px`;
  fly.style.width = `${from.width}px`;
  fly.style.height = `${from.height}px`;
  flyingContainer.appendChild(fly);

  requestAnimationFrame(() => {
    fly.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`;
    fly.style.opacity = '0.85';
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      fly.remove();
      resolve();
    }, 520);
  });
}
