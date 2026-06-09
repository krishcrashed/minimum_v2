import { cardValue, handTotal, groupByRank } from './cards.js';

function rankGroupsByValue(hand, jokerRank) {
  const groups = groupByRank(hand);
  return Object.entries(groups)
    .map(([rank, cards]) => ({
      rank,
      cards,
      value: cardValue(cards[0], jokerRank),
      count: cards.length,
    }))
    .sort((a, b) => b.value - a.value || b.count - a.count);
}

export function chooseDiscard(hand, jokerRank) {
  const groups = rankGroupsByValue(hand, jokerRank);
  if (groups.length === 0) return [];

  const highest = groups[0];
  // Prefer discarding multiple of the same high rank
  if (highest.count > 1 && highest.value >= 5) {
    return [...highest.cards];
  }
  // Single highest card
  return [highest.cards[0]];
}

export function chooseDrawSource(hand, discardTop, jokerRank) {
  if (!discardTop) return 'draw';

  const currentTotal = handTotal(hand, jokerRank);
  const discardVal = cardValue(discardTop, jokerRank);
  const avgInHand = hand.length ? currentTotal / hand.length : 0;

  // Take discard if it lowers our average significantly
  if (discardVal < avgInHand - 1) return 'discard';
  if (discardVal === 0) return 'discard';
  if (discardVal <= 3 && Math.random() > 0.3) return 'discard';

  return 'draw';
}

export function shouldCallMinimum(hand, jokerRank, roundNumber, playerCount) {
  const total = handTotal(hand, jokerRank);
  const cardsLeft = hand.length;

  // Threshold scales with cards in hand and round
  const baseThreshold = Math.max(2, Math.floor(cardsLeft * 1.8));
  const aggression = 0.85 + roundNumber * 0.03;

  if (total <= baseThreshold * aggression) {
    return Math.random() < 0.55 + (roundNumber * 0.05);
  }

  // Very low hands — call more often
  if (total <= 3 && cardsLeft <= 3) {
    return Math.random() < 0.75;
  }

  return false;
}

export function aiTurnDelay() {
  return 800 + Math.random() * 900;
}
