import {
  createDeck,
  shuffle,
  handTotal,
  cardValue,
  sameRank,
} from './cards.js';
import { chooseDiscard, chooseDrawSource, shouldCallMinimum } from './ai.js';

export const TOTAL_ROUNDS = 7;
export const POINTS_PER_LOSER = 10;
export const WRONG_CALLER_PENALTY = 20;

export const PHASE = {
  IDLE: 'idle',
  DEALING: 'dealing',
  SETUP: 'setup',
  PLAYING: 'playing',
  REVEAL: 'reveal',
  ROUND_END: 'round_end',
  GAME_END: 'game_end',
};

export function cardsPerRound(round) {
  return 8 - round; // round 1 → 7, round 7 → 1
}

export function createPlayers(count) {
  const names = ['You', 'Alex', 'Sam', 'Jordan'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: names[i],
    isHuman: i === 0,
    hand: [],
    score: 0,
  }));
}

export function createGame(playerCount = 4) {
  return {
    players: createPlayers(playerCount),
    round: 1,
    phase: PHASE.IDLE,
    deck: [],
    drawPile: [],
    discardPile: [],
    jokerRank: null,
    jokerCard: null,
    currentPlayerIndex: 0,
    selectedCardIds: new Set(),
    roundHistory: [],
    winner: null,
    caller: null,
    revealData: null,
  };
}

export function startRound(game) {
  const perPlayer = cardsPerRound(game.round);
  const needed = perPlayer * game.players.length + 2; // +2 for joker reveal & discard starter

  let deck = shuffle(createDeck());
  if (deck.length < needed) {
    deck = shuffle(createDeck());
  }

  const players = game.players.map((p) => ({ ...p, hand: [] }));
  const dealOrder = [];

  // Deal one card at a time, round-robin
  for (let c = 0; c < perPlayer; c++) {
    for (let p = 0; p < players.length; p++) {
      const card = deck.pop();
      players[p].hand.push(card);
      dealOrder.push({ playerIndex: p, card });
    }
  }

  const jokerCard = deck.pop();
  const jokerRank = jokerCard.rank;
  const discardStarter = deck.pop();

  return {
    ...game,
    players,
    deck,
    drawPile: deck,
    discardPile: [discardStarter],
    jokerRank,
    jokerCard,
    currentPlayerIndex: 0,
    phase: PHASE.DEALING,
    selectedCardIds: new Set(),
    caller: null,
    revealData: null,
    dealOrder,
    dealIndex: 0,
    jokerRevealed: false,
    discardRevealed: false,
  };
}

export function advanceDeal(game) {
  if (game.dealIndex >= game.dealOrder.length) {
    return {
      ...game,
      phase: PHASE.PLAYING,
      dealOrder: null,
      dealIndex: null,
    };
  }
  return { ...game, dealIndex: game.dealIndex + 1 };
}

export function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

export function toggleCardSelection(game, cardId) {
  if (game.phase !== PHASE.PLAYING) return game;
  const player = getCurrentPlayer(game);
  if (!player.isHuman) return game;

  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return game;

  const selected = new Set(game.selectedCardIds);
  const selectedCards = player.hand.filter((c) => selected.has(c.id));

  if (selected.has(cardId)) {
    selected.delete(cardId);
  } else {
    // Must be same rank as already selected, or first selection
    if (selectedCards.length > 0 && !selectedCards.every((c) => sameRank(c, card))) {
      return game;
    }
    if (selectedCards.length > 0 && !sameRank(card, selectedCards[0])) {
      return game;
    }
    selected.add(cardId);
  }

  return { ...game, selectedCardIds: selected };
}

function validateDiscard(hand, cardIds) {
  if (cardIds.length === 0) return false;
  const cards = hand.filter((c) => cardIds.includes(c.id));
  if (cards.length !== cardIds.length) return false;
  const rank = cards[0].rank;
  return cards.every((c) => c.rank === rank);
}

function applyDiscard(player, cardIds) {
  const toDiscard = player.hand.filter((c) => cardIds.includes(c.id));
  const remaining = player.hand.filter((c) => !cardIds.includes(c.id));
  return { hand: remaining, discarded: toDiscard };
}

function nextPlayerIndex(game, from) {
  return (from + 1) % game.players.length;
}

export function executeTurn(game, { action, drawFrom }) {
  const player = getCurrentPlayer(game);
  let players = [...game.players];
  let drawPile = [...game.drawPile];
  let discardPile = [...game.discardPile];

  if (action === 'minimum') {
    return resolveMinimum({ ...game, players, caller: player });
  }

  if (action === 'play') {
    const cardIds = player.isHuman
      ? [...game.selectedCardIds]
      : chooseDiscard(player.hand, game.jokerRank).map((c) => c.id);

    if (!validateDiscard(player.hand, cardIds)) {
      return game;
    }

    const { hand, discarded } = applyDiscard(player, cardIds);
    players[game.currentPlayerIndex] = { ...player, hand };
    discardPile = [...discardPile, ...discarded];

    let drawnCard = null;
    if (drawFrom === 'discard' && discardPile.length > 1) {
      // Take the card that was top BEFORE our discard (second from end after discard)
      const topBefore = discardPile[discardPile.length - discarded.length - 1];
      drawnCard = topBefore;
      // Remove that card from pile (not the ones we just discarded)
      const idx = discardPile.findIndex(
        (c, i) => i === discardPile.length - discarded.length - 1
      );
      if (idx >= 0) {
        discardPile = discardPile.filter((_, i) => i !== idx);
      }
    } else if (drawPile.length > 0) {
      drawnCard = drawPile.pop();
    }

    if (drawnCard) {
      players[game.currentPlayerIndex] = {
        ...players[game.currentPlayerIndex],
        hand: [...players[game.currentPlayerIndex].hand, drawnCard],
      };
    }

    const next = nextPlayerIndex(game, game.currentPlayerIndex);
    return {
      ...game,
      players,
      drawPile,
      discardPile,
      currentPlayerIndex: next,
      selectedCardIds: new Set(),
      lastAction: {
        playerIndex: game.currentPlayerIndex,
        discarded,
        drawnCard,
        drawFrom,
      },
    };
  }

  return game;
}

export function resolveMinimum(game) {
  const caller = game.caller || getCurrentPlayer(game);
  const totals = game.players.map((p) => ({
    player: p,
    total: handTotal(p.hand, game.jokerRank),
  }));

  totals.sort((a, b) => a.total - b.total);
  const lowest = totals[0].total;
  const winners = totals.filter((t) => t.total === lowest);
  const callerTotal = totals.find((t) => t.player.id === caller.id).total;

  // Caller wins only if they have the minimum (or tied for minimum)
  const callerWins = callerTotal === lowest;
  const actualWinner = callerWins ? caller : winners[0].player;
  const playerCount = game.players.length;

  let players;
  let deltas;

  if (callerWins) {
    const winnerGain = (playerCount - 1) * POINTS_PER_LOSER;
    players = game.players.map((p) => {
      if (p.id === actualWinner.id) {
        return { ...p, score: p.score + winnerGain };
      }
      return { ...p, score: p.score - POINTS_PER_LOSER };
    });
    deltas = game.players.map((p) => ({
      player: p,
      delta: p.id === actualWinner.id ? winnerGain : -POINTS_PER_LOSER,
      total: handTotal(p.hand, game.jokerRank),
    }));
  } else {
    // Wrong caller loses 20; actual winner gets +10 bonus from them
    const winnerGain = (playerCount - 2) * POINTS_PER_LOSER + WRONG_CALLER_PENALTY;
    players = game.players.map((p) => {
      if (p.id === actualWinner.id) {
        return { ...p, score: p.score + winnerGain };
      }
      if (p.id === caller.id) {
        return { ...p, score: p.score - WRONG_CALLER_PENALTY };
      }
      return { ...p, score: p.score - POINTS_PER_LOSER };
    });
    deltas = game.players.map((p) => {
      let delta;
      if (p.id === actualWinner.id) delta = winnerGain;
      else if (p.id === caller.id) delta = -WRONG_CALLER_PENALTY;
      else delta = -POINTS_PER_LOSER;
      return { player: p, delta, total: handTotal(p.hand, game.jokerRank) };
    });
  }

  const pointsTransfer = deltas.find((d) => d.player.id === actualWinner.id).delta;

  const revealData = {
    totals,
    caller,
    callerWins,
    actualWinner,
    pointsTransfer,
    deltas,
  };

  return {
    ...game,
    players,
    phase: PHASE.REVEAL,
    revealData,
    caller,
  };
}

export function callMinimum(game) {
  const player = getCurrentPlayer(game);
  return resolveMinimum({ ...game, caller: player });
}

export function advanceAfterReveal(game) {
  const history = [
    ...game.roundHistory,
    {
      round: game.round,
      winner: game.revealData.actualWinner.name,
      caller: game.revealData.caller.name,
      callerWins: game.revealData.callerWins,
    },
  ];

  if (game.round >= TOTAL_ROUNDS) {
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    return {
      ...game,
      roundHistory: history,
      phase: PHASE.GAME_END,
      winner: sorted[0],
    };
  }

  return {
    ...game,
    round: game.round + 1,
    roundHistory: history,
    phase: PHASE.ROUND_END,
    revealData: null,
    caller: null,
  };
}

export function getAiAction(game) {
  const player = getCurrentPlayer(game);

  if (shouldCallMinimum(player.hand, game.jokerRank, game.round, game.players.length)) {
    return { action: 'minimum' };
  }

  const toDiscard = chooseDiscard(player.hand, game.jokerRank);
  const discardTop =
    game.discardPile.length > 0
      ? game.discardPile[game.discardPile.length - 1]
      : null;
  const drawFrom = chooseDrawSource(player.hand, discardTop, game.jokerRank);

  return {
    action: 'play',
    drawFrom,
    cardIds: toDiscard.map((c) => c.id),
  };
}

export function canHumanPlay(game) {
  if (game.phase !== PHASE.PLAYING) return false;
  const player = getCurrentPlayer(game);
  return player.isHuman;
}

export function getDiscardTop(game) {
  if (game.discardPile.length === 0) return null;
  return game.discardPile[game.discardPile.length - 1];
}
