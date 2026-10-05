// Matches an imported action to the closest action in the solver's tree.

import { bb, type ActionInfo } from './analysis';
import type { LineAction } from './handHistory';

export type Match = { index: number; note?: string } | { error: string };

export function matchAction(actions: ActionInfo[], la: LineAction): Match {
  const find = (kind: ActionInfo['kind']) => actions.findIndex(a => a.kind === kind);
  switch (la.kind) {
    case 'check':
    case 'fold':
    case 'call': {
      let i = find(la.kind);
      // Calling an all-in shows up as a call; checking when the tree expects a call can't happen.
      if (i < 0 && la.kind === 'fold') i = find('check');
      return i >= 0 ? { index: i } : { error: `${la.text}, but the solver’s tree has no ${la.kind} here.` };
    }
    case 'bet':
    case 'raise': {
      const sized = actions
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin');
      if (sized.length === 0) return { error: `${la.text}, but the solver only checks/calls here.` };
      const allIn = la.allIn ? sized.find(({ a }) => a.kind === 'allin') : undefined;
      const best =
        allIn ??
        sized.reduce((x, y) =>
          Math.abs(Math.log(y.a.amount / la.toChips)) < Math.abs(Math.log(x.a.amount / la.toChips)) ? y : x,
        );
      const off = Math.abs(best.a.amount - la.toChips) / la.toChips;
      const note =
        off > 0.2
          ? `Actual size ${bb(la.toChips)}; the closest size in the solver’s tree is ${best.a.label.toLowerCase()}.`
          : undefined;
      return { index: best.i, note };
    }
  }
}
