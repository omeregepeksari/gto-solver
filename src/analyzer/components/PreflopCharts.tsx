import { useMemo, useState } from 'react';
import { useAnalyzer } from '../analyzerStore';
import { chartAt, preflopActionInfo, scenarioSteps, walk, type Scenario } from '../preflop';
import { actionColors } from '../analysis';
import { gridLabel } from '../cards';
import { POSITIONS, type Position } from '../spots';
import { RangeGrid } from './RangeGrid';

type Kind = Scenario['kind'];

const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'open', label: 'Open' },
  { kind: 'vsOpen', label: 'Vs open' },
  { kind: 'vs3bet', label: 'Vs 3-bet' },
  { kind: 'vs4bet', label: 'Vs 4-bet' },
];

const ORDER: Position[] = POSITIONS;
const before = (p: Position) => ORDER.slice(0, ORDER.indexOf(p));
const after = (p: Position) => ORDER.slice(ORDER.indexOf(p) + 1);

/** Positions allowed for "you" and the other player in each scenario. */
function choices(kind: Kind, hero: Position): { heroes: Position[]; others: Position[]; otherLabel: string } {
  switch (kind) {
    case 'open':
      return { heroes: ORDER.slice(0, 5), others: [], otherLabel: '' };
    case 'vsOpen':
      return { heroes: ORDER.slice(1), others: before(hero).filter(p => p !== 'BB'), otherLabel: 'Opener' };
    case 'vs3bet':
      return { heroes: ORDER.slice(0, 5), others: after(hero), otherLabel: '3-bettor' };
    case 'vs4bet':
      return { heroes: ORDER.slice(1), others: before(hero).filter(p => p !== 'BB'), otherLabel: 'Opener (4-bets)' };
  }
}

function toScenario(kind: Kind, hero: Position, other: Position): Scenario {
  switch (kind) {
    case 'open':
      return { kind, hero };
    case 'vsOpen':
      return { kind, hero, opener: other };
    case 'vs3bet':
      return { kind, hero, threeBettor: other };
    case 'vs4bet':
      return { kind, hero, opener: other };
  }
}

export function PreflopCharts() {
  const { preflop, rake, setRake } = useAnalyzer();
  const [kind, setKind] = useState<Kind>('open');
  const [hero, setHero] = useState<Position>('BTN');
  const [other, setOther] = useState<Position>('CO');
  const [lookup, setLookup] = useState('');

  const { heroes, others, otherLabel } = choices(kind, hero);
  const h = heroes.includes(hero) ? hero : heroes[heroes.length - 1];
  const o = others.includes(other) ? other : others[others.length - 1];

  const chart = useMemo(() => {
    if (!preflop) return null;
    if (kind !== 'open' && !o) return 'No position can do that before you.';
    const res = walk(preflop, scenarioSteps(toScenario(kind, h, o!)));
    if (typeof res === 'string') return res;
    return chartAt(preflop, res.node) ?? 'This spot never happens in the solver’s model.';
  }, [preflop, kind, h, o]);

  if (!preflop) return <div className="az-solving"><div className="spinner" /><p className="muted">Loading preflop solution…</p></div>;

  const infos = typeof chart === 'object' && chart ? chart.node.a.map((c, i) => preflopActionInfo(c, chart.actions[i])) : [];
  const colors = actionColors(infos);
  const cells =
    typeof chart === 'object' && chart
      ? chart.freqs.map(f => ({ weight: 1, maxCombos: 1, freqs: f }))
      : [];

  const wanted = lookup.trim().toUpperCase().replace(/10/g, 'T');
  const lookupIdx = Array.from({ length: 169 }, (_, i) => gridLabel(Math.floor(i / 13), i % 13).toUpperCase()).indexOf(wanted);
  const hl = lookupIdx >= 0 ? ([Math.floor(lookupIdx / 13), lookupIdx % 13] as [number, number]) : null;

  return (
    <div className="pf">
      <section className="az-section">
        <div className="az-row">
          <span className="az-row-label">Situation</span>
          <div className="seg">
            {KINDS.map(k => (
              <button key={k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => setKind(k.kind)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="az-row">
          <span className="az-row-label">You</span>
          <div className="seg">
            {heroes.map(p => (
              <button key={p} className={h === p ? 'on' : ''} onClick={() => setHero(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {kind !== 'open' && (
          <div className="az-row">
            <span className="az-row-label">{otherLabel}</span>
            <div className="seg">
              {others.map(p => (
                <button key={p} className={o === p ? 'on' : ''} onClick={() => setOther(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="az-row">
          <span className="az-row-label">Rake</span>
          <div className="seg">
            <button className={rake === 'none' ? 'on' : ''} onClick={() => setRake('none')}>None</button>
            <button className={rake === 'rake' ? 'on' : ''} onClick={() => setRake('rake')}>5% (3bb cap)</button>
          </div>
        </div>
      </section>

      {typeof chart === 'string' || !chart ? (
        <p className="az-warn">{chart}</p>
      ) : (
        <div className="pf-body">
          <div className="pf-chart">
            <div className="pf-totals">
              {chart.actions.map((a, i) => (
                <span key={a} className="pf-total">
                  <i style={{ background: colors[i] }} />
                  {a} <b>{(chart.totals[i] * 100).toFixed(1)}%</b>
                </span>
              ))}
            </div>
            <RangeGrid cells={cells} colors={colors} actionNames={chart.actions} highlight={hl} />
          </div>
          <div className="pf-side">
            <div className="az-panel">
              <h3>Check a hand</h3>
              <input
                className="az-quick pf-lookup"
                placeholder="e.g. AJo, 76s, 99"
                value={lookup}
                onChange={e => setLookup(e.target.value)}
              />
              {lookupIdx >= 0 && (
                <div className="az-options">
                  {chart.actions.map((a, i) => {
                    const evs = chart.evs[lookupIdx];
                    const best = Math.max(...evs);
                    const diff = evs[i] - best;
                    return (
                      <div key={a} className="az-option pf-option">
                        <span className="az-dot" style={{ background: colors[i] }} />
                        <span className="az-option-name">{a}</span>
                        <span className="az-freq">{Math.round(chart.freqs[lookupIdx][i] * 100)}%</span>
                        <span className={`az-ev ${diff > -0.05 ? 'ev-best' : ''}`}>
                          {diff > -0.05 ? `best · EV ${evs[i] >= 0 ? '+' : ''}${evs[i].toFixed(2)}bb` : `−${(-diff).toFixed(2)}bb vs best`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="az-hint pf-model">
              Solved for 6-max, 100bb. Opens are 2.5bb (SB 3bb), 3-bets 3x in position and 4x from the blinds,
              4-bets 2.3x. To keep pots heads-up only the big blind flat-calls; everyone else 3-bets or folds. The
              postflop isn’t played out — each hand gets its equity adjusted for position and playability — so
              speculative hands like suited connectors come out a bit tighter than in full solvers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
