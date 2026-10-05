// Hand-history importer for the PokerStars-style text format that most sites (including
// CoinPoker) export:
//
//   CoinPoker Hand #123: Hold'em No Limit (₮0.25/₮0.50) - 2026/10/05 12:00:00
//   Table 'X' 6-max Seat #3 is the button
//   Seat 1: alice (₮50.00 in chips)
//   alice: posts small blind ₮0.25
//   *** HOLE CARDS ***
//   Dealt to Hero [As Qh]
//   Hero: raises ₮0.75 to ₮1.25
//   *** FLOP *** [Qd 8c 3s]
//   ...
//
// The parser is deliberately forgiving: it ignores lines it doesn't understand and only needs
// seats, the button, blinds, the hero's cards, the board and the betting actions.

import { RANK_CHARS, SUIT_CHARS, cardId } from './cards';
import { BB, type Position, type PotType } from './spots';

export type LineActionKind = 'check' | 'bet' | 'call' | 'raise' | 'fold';

export interface LineAction {
  /** 0 = flop, 1 = turn, 2 = river. */
  street: number;
  who: 'hero' | 'villain';
  kind: LineActionKind;
  /** For bets/raises: the player's total chips in on this street after the action. */
  toChips: number;
  allIn: boolean;
  /** Human-readable, e.g. "bets 2.5bb". */
  text: string;
}

export interface ImportedHand {
  heroName: string;
  villainName: string;
  heroPos: Position;
  villainPos: Position;
  potType: PotType;
  heroCards: [number, number];
  board: number[];
  /** Pot and effective stack at the start of the flop, in solver chips (see BB). */
  pot: number;
  stack: number;
  line: LineAction[];
  /** e.g. "BTN opens 2.5bb, you call in the BB". */
  story: string;
  warnings: string[];
}

const STREET_HEADERS = ['*** FLOP ***', '*** TURN ***', '*** RIVER ***'];

function parseAmount(s: string): number {
  const m = /([\d,]*\.?\d+)/.exec(s.replace(/\s/g, ''));
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}

function parseCard(s: string): number | null {
  const m = /^(10|[2-9TJQKA])([cdhs])$/i.exec(s.trim());
  if (!m) return null;
  const rank = RANK_CHARS.indexOf(m[1] === '10' ? 'T' : m[1].toUpperCase());
  return cardId(rank, SUIT_CHARS.indexOf(m[2].toLowerCase()));
}

function parseCards(s: string): number[] {
  return s.split(/\s+/).map(parseCard).filter((c): c is number => c !== null);
}

/** Assign positions clockwise from the button. Seats are already in table order. */
function positionsFor(order: string[], button: string): Map<string, Position> {
  const n = order.length;
  const start = order.indexOf(button);
  const rotated = order.slice(start).concat(order.slice(0, start)); // BTN, SB, BB, ...
  const map = new Map<string, Position>();
  if (n === 2) {
    map.set(rotated[0], 'BTN');
    map.set(rotated[1], 'BB');
    return map;
  }
  map.set(rotated[0], 'BTN');
  map.set(rotated[1], 'SB');
  map.set(rotated[2], 'BB');
  const rest = rotated.slice(3);
  const late: Position[] = ['UTG', 'HJ', 'CO'];
  rest.forEach((name, i) => {
    const fromEnd = rest.length - i; // CO is the seat right before the button
    map.set(name, fromEnd <= 3 ? late[3 - fromEnd] : 'UTG');
  });
  return map;
}

export function parseHandHistory(text: string): ImportedHand | string {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return 'That doesn’t look like a hand history — paste the whole hand text.';

  // ---- header: blinds and button ----
  let bigBlind = NaN;
  const stakes = /\(([^()/]+)\/([^()/]+?)(?:\s+[A-Z]{3,4})?\)/.exec(lines.slice(0, 3).join(' '));
  if (stakes) bigBlind = parseAmount(stakes[2]);
  const buttonSeat = /Seat #(\d+) is the button/i.exec(text)?.[1];

  // ---- seats (before the first *** section) ----
  const seats: { seat: number; name: string; stack: number }[] = [];
  for (const line of lines) {
    if (line.startsWith('***')) break;
    const m = /^Seat (\d+): (.+?) \(([^()]*?)(?: in chips)?\)/i.exec(line);
    if (m && !/sitting out/i.test(line)) seats.push({ seat: Number(m[1]), name: m[2], stack: parseAmount(m[3]) });
  }
  if (seats.length < 2) return 'Couldn’t find the players’ seats in this hand history.';

  // ---- walk the actions ----
  let street = -1; // -1 = preflop
  let heroName = '';
  let heroCards: number[] = [];
  let board: number[] = [];
  const invested = new Map<string, number>(); // whole hand
  let preflopIn = new Map<string, number>(); // snapshot when the flop is dealt
  const streetIn = new Map<string, number>(); // current street
  const foldedPreflop = new Set<string>();
  let preflopRaises = 0;
  let lastPreflopRaiser = '';
  const preflopStory: { name: string; verb: 'calls' | 'raises'; total: number }[] = [];
  const postflop: { street: number; name: string; kind: LineActionKind; to: number; allIn: boolean }[] = [];

  const add = (name: string, amount: number) => {
    invested.set(name, (invested.get(name) ?? 0) + amount);
    streetIn.set(name, (streetIn.get(name) ?? 0) + amount);
  };

  for (const line of lines) {
    const dealt = /^Dealt to (.+?) \[(.+?)\]/i.exec(line);
    if (dealt) {
      heroName = dealt[1];
      heroCards = parseCards(dealt[2]);
      continue;
    }
    const header = STREET_HEADERS.findIndex(h => line.toUpperCase().startsWith(h));
    if (header >= 0) {
      if (header === 0) preflopIn = new Map(invested);
      street = header;
      streetIn.clear();
      const brackets = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => parseCards(m[1]));
      board = header === 0 ? brackets[0] ?? [] : [...board, ...(brackets[brackets.length - 1] ?? [])];
      continue;
    }
    if (/^\*\*\* (SHOW ?DOWN|SUMMARY)/i.test(line)) break;

    const uncalled = /^Uncalled bet \((.+?)\) returned to (.+)$/i.exec(line);
    if (uncalled) {
      add(uncalled[2], -parseAmount(uncalled[1]));
      continue;
    }

    const m = /^(.+?): (posts|folds|checks|calls|bets|raises)\b(.*)$/i.exec(line);
    if (!m) continue;
    const [, name, verbRaw, rest] = m;
    const verb = verbRaw.toLowerCase();
    const allIn = /all-?in/i.test(rest);

    if (verb === 'posts') {
      const amount = parseAmount(rest);
      if (/big blind/i.test(rest) && !(bigBlind > 0)) bigBlind = amount;
      if (Number.isFinite(amount)) add(name, amount);
      continue;
    }
    if (verb === 'folds') {
      if (street < 0) foldedPreflop.add(name);
      else postflop.push({ street, name, kind: 'fold', to: 0, allIn: false });
      continue;
    }
    if (verb === 'checks') {
      if (street >= 0) postflop.push({ street, name, kind: 'check', to: 0, allIn: false });
      continue;
    }
    if (verb === 'calls') {
      add(name, parseAmount(rest));
      if (street < 0) preflopStory.push({ name, verb: 'calls', total: streetIn.get(name)! });
      else postflop.push({ street, name, kind: 'call', to: streetIn.get(name)!, allIn });
      continue;
    }
    if (verb === 'bets') {
      add(name, parseAmount(rest));
      if (street >= 0) postflop.push({ street, name, kind: 'bet', to: streetIn.get(name)!, allIn });
      continue;
    }
    // raises X to Y: Y is the player's total for the street
    const to = /\bto\s+(.+?)(?:\s+and\b|$)/i.exec(rest);
    const total = to ? parseAmount(to[1]) : parseAmount(rest);
    add(name, total - (streetIn.get(name) ?? 0));
    if (street < 0) {
      preflopRaises++;
      lastPreflopRaiser = name;
      preflopStory.push({ name, verb: 'raises', total });
    } else {
      postflop.push({ street, name, kind: 'raise', to: total, allIn });
    }
  }

  if (!(bigBlind > 0)) return 'Couldn’t find the big blind size.';
  if (!heroName || heroCards.length !== 2) return 'Couldn’t find your hole cards (the “Dealt to …” line).';
  if (board.length < 3) return 'This hand ended before the flop — there’s nothing to analyze postflop.';

  // ---- who's in the pot ----
  const order = [...seats].sort((a, b) => a.seat - b.seat).map(s => s.name);
  const button = seats.find(s => String(s.seat) === buttonSeat)?.name;
  if (!button) return 'Couldn’t find the button seat.';
  const pos = positionsFor(order, button);

  // In the pot at the flop: didn't fold preflop and either put chips in or acted postflop.
  const inPot = order.filter(
    n => !foldedPreflop.has(n) && ((preflopIn.get(n) ?? 0) > 0 || postflop.some(a => a.name === n)),
  );
  if (!inPot.includes(heroName)) return 'You folded preflop — there’s nothing to analyze postflop.';
  const others = inPot.filter(n => n !== heroName);
  if (others.length === 0) return 'Couldn’t find your opponent in this hand.';

  const warnings: string[] = [];
  let villainName = others[0];
  if (others.length > 1) {
    villainName = others.includes(lastPreflopRaiser) ? lastPreflopRaiser : others[others.length - 1];
    warnings.push(
      `This was a ${others.length + 1}-way pot. The solver handles two players, so it’s analyzed as you vs ${villainName} — treat it as a rough guide.`,
    );
  }

  let potType: PotType = preflopRaises >= 2 ? '3bet' : 'srp';
  if (preflopRaises >= 3) warnings.push('This was a 4-bet pot; it’s analyzed with 3-bet pot ranges.');
  if (preflopRaises === 0) {
    potType = 'srp';
    warnings.push('This pot was limped; it’s analyzed with raised-pot ranges, so ranges are tighter than reality.');
  }

  const toChips = (amount: number) => Math.round((amount / bigBlind) * BB);
  const potAtFlop = [...preflopIn.values()].reduce((a, b) => a + b, 0);
  const stackOf = (n: string) => seats.find(s => s.name === n)!.stack;
  const behind = (n: string) => stackOf(n) - (preflopIn.get(n) ?? 0);
  const effective = Math.min(behind(heroName), behind(villainName));

  const line: LineAction[] = postflop
    .filter(a => a.name === heroName || a.name === villainName)
    .map(a => {
      const who = a.name === heroName ? 'hero' : 'villain';
      const amt = a.to / bigBlind;
      const amtText = `${Number.isInteger(amt) ? amt : amt.toFixed(1)}bb`;
      const hero = who === 'hero';
      const verb = {
        check: hero ? 'check' : 'checks',
        fold: hero ? 'fold' : 'folds',
        call: hero ? 'call' : 'calls',
        bet: `${hero ? 'bet' : 'bets'} ${amtText}`,
        raise: `${hero ? 'raise' : 'raises'} to ${amtText}`,
      }[a.kind];
      return {
        street: a.street,
        who,
        kind: a.kind,
        toChips: toChips(a.to),
        allIn: a.allIn,
        text: `${who === 'hero' ? 'You' : villainName} ${verb}${a.allIn ? ' (all-in)' : ''}`,
      };
    });

  const heroPos = pos.get(heroName)!;
  const villainPos = pos.get(villainName)!;
  if (heroPos === villainPos) return 'Couldn’t work out the positions in this hand.';

  return {
    heroName,
    villainName,
    heroPos,
    villainPos,
    potType,
    heroCards: [heroCards[0], heroCards[1]],
    board: board.slice(0, 5),
    pot: Math.max(1, toChips(potAtFlop)),
    stack: Math.max(1, toChips(effective)),
    line,
    story: preflopStory
      .filter(e => inPot.includes(e.name))
      .map(e => {
        const who = e.name === heroName ? `You (${heroPos})` : pos.get(e.name);
        const amt = +(e.total / bigBlind).toFixed(1);
        const you = e.name === heroName;
        return e.verb === 'raises' ? `${who} ${you ? 'raise' : 'raises'} to ${amt}bb` : `${who} ${you ? 'call' : 'calls'}`;
      })
      .join(', '),
    warnings,
  };
}
