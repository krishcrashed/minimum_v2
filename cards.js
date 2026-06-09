export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RED_SUITS = new Set(['♥', '♦']);

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}-${suit}` });
    }
  }
  return deck;
}

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function rankValue(rank) {
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export function cardValue(card, jokerRank) {
  if (jokerRank && card.rank === jokerRank) return 0;
  return rankValue(card.rank);
}

export function handTotal(hand, jokerRank) {
  return hand.reduce((sum, c) => sum + cardValue(c, jokerRank), 0);
}

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

export function sameRank(a, b) {
  return a.rank === b.rank;
}

export function groupByRank(hand) {
  const groups = {};
  for (const card of hand) {
    if (!groups[card.rank]) groups[card.rank] = [];
    groups[card.rank].push(card);
  }
  return groups;
}
