import { useMemo, useState } from 'react';
import { useAnalyzer, type Step } from '../analyzerStore';
import {
  actionColors,
  bb,
  GRADE_TEXT,
  heroView,
  rangeActionFreqs,
  rangeBreakdown,
  rangeGrid,
  type Decision,
} from '../analysis';
import { BUCKET, describeHand } from '../handStrength';
import { cardLabel, gridPos } from '../cards';
import { BB } from '../spots';
import { MiniCard } from './MiniCard';
import { CardGrid } from './CardGrid';
import { RangeGrid } from './RangeGrid';

const STREET_NAME = ['', '', '', 'Flop', 'Turn', 'River'];
/** EV differences under 0.05bb are noise. */
const NEGLIGIBLE = 0.05 * BB;

export function ReviewView() {
  const { solved, steps, heroCards, villainPos, heroPos } = useAnalyzer();
  const [rangeTab, setRangeTab] = useState<'villain' | 'hero'>('villain');
  if (!solved || steps.length === 0) return null;

  const step = steps[steps.length - 1];
  const { node } = step;
  const hero = solved.spot.hero;
  const villain = 1 - hero;
  const h1 = heroCards[0]!;
  const h2 = heroCards[1]!;
  const name = (p: number) => (p === hero ? 'You' : villainPos);
  const prevStep = steps[steps.length - 2];
  const justDecided = prevStep?.decision;

  return (
    <div className="az-review">
      <Timeline steps={steps} hero={hero} villainName={villainPos} />

      <div className="az-review-grid">
        <div className="az-main">
          <div className="az-table">
            <div className="az-board">
              {node.board.map(c => <MiniCard key={c} card={c} size="lg" />)}
              {Array.from({ length: 5 - node.board.length }, (_, i) => <MiniCard key={`e${i}`} card={null} size="lg" placeholder="" />)}
            </div>
            <div className="az-pot">
              <span>Pot <b>{bb(node.pot)}</b></span>
              <span className="muted">Stacks {bb(node.stack - Math.max(...node.bets))}</span>
            </div>
            <div className="az-hero-hand">
              <MiniCard card={h1} size="md" />
              <MiniCard card={h2} size="md" />
              <span>
                You ({heroPos}): <b>{describeHand(h1, h2, node.board)}</b>
              </span>
            </div>
          </div>

          {justDecided && <DecisionFeedback d={justDecided} />}

          {node.kind === 'action' && node.player === hero && <HeroDecision step={step} />}
          {node.kind === 'action' && node.player === villain && <VillainDecision step={step} name={name(villain)} />}
          {node.kind === 'chance' && <DealCard step={step} />}
          {node.kind === 'terminal' && <HandOver steps={steps} hero={hero} villainName={villainPos} />}
        </div>

        <aside className="az-side">
          <div className="seg seg-full">
            <button className={rangeTab === 'villain' ? 'on' : ''} onClick={() => setRangeTab('villain')}>
              {villainPos}’s range
            </button>
            <button className={rangeTab === 'hero' ? 'on' : ''} onClick={() => setRangeTab('hero')}>
              Your range
            </button>
          </div>
          <RangePanel step={step} player={rangeTab === 'villain' ? villain : hero} />
        </aside>
      </div>
    </div>
  );
}

function Timeline({ steps, hero, villainName }: { steps: Step[]; hero: number; villainName: string }) {
  const goTo = useAnalyzer(s => s.goTo);
  const items: { key: string; label: string; stepIdx: number; cls: string }[] = [];
  steps.forEach((s, i) => {
    if (i === 0) {
      items.push({ key: 'start', label: `${STREET_NAME[s.node.board.length]} ${s.node.board.map(cardLabel).join(' ')}`, stepIdx: 0, cls: 'tl-street' });
    }
    if (s.chosen === undefined) return;
    if (s.node.kind === 'chance') {
      items.push({ key: `c${i}`, label: `${STREET_NAME[s.node.board.length + 1]} ${cardLabel(s.chosen)}`, stepIdx: i, cls: 'tl-street' });
    } else if (s.node.kind === 'action') {
      const who = s.node.player === hero ? 'You' : villainName;
      const a = s.actions[s.chosen];
      const grade = s.decision ? ` tl-${GRADE_TEXT[s.decision.grade].tone}` : '';
      items.push({ key: `a${i}`, label: `${who} ${a.short.toLowerCase()}`, stepIdx: i, cls: `tl-action${grade}` });
    }
  });
  return (
    <div className="az-timeline">
      {items.map((it, i) => (
        <button key={it.key} className={`tl-item ${it.cls}`} onClick={() => goTo(it.stepIdx)} title="Go back to here">
          {it.label}
          {i < items.length - 1 && <span className="tl-arrow">›</span>}
        </button>
      ))}
    </div>
  );
}

function DecisionFeedback({ d }: { d: Decision }) {
  const g = GRADE_TEXT[d.grade];
  const pct = (100 * d.loss) / d.potAtDecision;
  return (
    <div className={`az-feedback fb-${g.tone}`}>
      <div className="fb-title">
        {g.tone === 'good' ? '✓' : g.tone === 'ok' ? '~' : '✗'} {d.chosen.action.label}: {g.title}
      </div>
      <div className="fb-body">
        {d.grade === 'best' && <>The solver does this {Math.round(d.chosen.freq * 100)}% of the time with your hand.</>}
        {d.grade !== 'best' && (
          <>
            Solver: <b>{d.best.action.label}</b> ({Math.round(d.best.freq * 100)}%). You chose an action it takes{' '}
            {Math.round(d.chosen.freq * 100)}% of the time
            {d.loss >= NEGLIGIBLE ? (
              <>
                , costing about <b>{bb(d.loss)}</b> ({pct.toFixed(pct < 1 ? 1 : 0)}% of the pot).
              </>
            ) : (
              <> — nearly the same EV.</>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HeroDecision({ step }: { step: Step }) {
  const { solved, choose, busy } = useAnalyzer();
  const s = solved!;
  const view = heroView(step.node, s.spot.hero, s.heroHandIdx, step.actions);
  const colors = actionColors(step.actions);
  if (!view?.options) return null;
  const sorted = [...view.options].sort((a, b) => b.freq - a.freq);
  const top = sorted[0];
  const second = sorted[1];

  let summary: string;
  if (top.freq > 0.9) summary = `Clear spot: the solver almost always plays ${top.action.short.toLowerCase()}.`;
  else if (second && second.freq > 0.25)
    summary = `Mixed spot: ${top.action.short.toLowerCase()} ${Math.round(top.freq * 100)}% / ${second.action.short.toLowerCase()} ${Math.round(second.freq * 100)}%. Both are fine — the EVs are almost equal.`;
  else summary = `Mostly ${top.action.short.toLowerCase()} (${Math.round(top.freq * 100)}%).`;

  return (
    <div className="az-panel">
      <div className="az-panel-head">
        <h3>Your move</h3>
        <EquityBadge equity={view.equity} percentile={view.equityPercentile} />
      </div>
      {!view.inRange && (
        <p className="az-note">
          {s.heroAddedToRange
            ? 'This hand isn’t in your preflop range for this spot, so the solver rarely has it here. Showing how it would play it anyway.'
            : 'The solver wouldn’t usually reach this spot with your hand — it would have played it differently earlier. Showing its best play from here anyway.'}
        </p>
      )}
      <p className="az-summary">{summary}</p>
      <div className="az-options">
        {view.options.map((o, i) => (
          <div key={o.action.code} className="az-option">
            <span className="az-dot" style={{ background: colors[i] }} />
            <span className="az-option-name">{o.action.label}</span>
            <span className="az-bar">
              <span style={{ width: `${o.freq * 100}%`, background: colors[i] }} />
            </span>
            <span className="az-freq">{Math.round(o.freq * 100)}%</span>
            <span className={`az-ev ${o.evVsBest > -NEGLIGIBLE ? 'ev-best' : ''}`}>
              {o.evVsBest > -NEGLIGIBLE ? 'best EV' : `−${bb(-o.evVsBest)}`}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => choose(i)}>
              I did this
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquityBadge({ equity, percentile }: { equity: number; percentile: number }) {
  if (!Number.isFinite(equity)) return null;
  return (
    <div className="az-equity" title="Equity = how often you'd win if all cards were dealt out now, against their current range">
      <span>
        <b>{Math.round(equity * 100)}%</b> equity vs their range
      </span>
      <span className="muted">stronger than {Math.round(percentile * 100)}% of your range</span>
    </div>
  );
}

function VillainDecision({ step, name }: { step: Step; name: string }) {
  const { solved, choose, busy, heroCards } = useAnalyzer();
  const s = solved!;
  const dead = [heroCards[0]!, heroCards[1]!];
  const cards = s.privateCards[step.node.player];
  const freqs = rangeActionFreqs(step.node, dead, cards, step.actions.length);
  const colors = actionColors(step.actions);
  return (
    <div className="az-panel">
      <div className="az-panel-head">
        <h3>{name} to act — what did they do?</h3>
      </div>
      <p className="az-summary">How {name} plays their whole range here (knowing you hold your cards):</p>
      <div className="az-options">
        {step.actions.map((a, i) => (
          <div key={a.code} className="az-option">
            <span className="az-dot" style={{ background: colors[i] }} />
            <span className="az-option-name">{a.label}</span>
            <span className="az-bar">
              <span style={{ width: `${freqs[i] * 100}%`, background: colors[i] }} />
            </span>
            <span className="az-freq">{Math.round(freqs[i] * 100)}%</span>
            <span />
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => choose(i)}>
              They did this
            </button>
          </div>
        ))}
      </div>
      <p className="az-hint">
        Didn’t see their exact size? Pick the closest one. See the table on the right for which hands take each line.
      </p>
    </div>
  );
}

function DealCard({ step }: { step: Step }) {
  const { choose, heroCards, busy } = useAnalyzer();
  const street = STREET_NAME[step.node.board.length + 1];
  return (
    <div className="az-panel">
      <div className="az-panel-head">
        <h3>Which {street.toLowerCase()} card came?</h3>
      </div>
      <CardGrid
        used={[...step.node.board, heroCards[0]!, heroCards[1]!]}
        allowed={step.node.possibleCards}
        onPick={c => !busy && choose(c)}
      />
    </div>
  );
}

function HandOver({ steps, hero, villainName }: { steps: Step[]; hero: number; villainName: string }) {
  const backToSetup = useAnalyzer(s => s.backToSetup);
  const decisions = steps.filter(s => s.decision).map(s => s.decision!);
  const totalLoss = decisions.reduce((a, d) => a + d.loss, 0);
  const last = steps[steps.length - 2];
  const lastAction = last?.actions[last.chosen ?? 0];
  return (
    <div className="az-panel">
      <div className="az-panel-head">
        <h3>
          Hand over —{' '}
          {lastAction?.kind === 'fold' ? `${last.node.player === hero ? 'you' : villainName} folded` : 'showdown'}
        </h3>
      </div>
      {decisions.length === 0 ? (
        <p className="az-summary">You didn’t make any decisions in this line.</p>
      ) : (
        <>
          <p className="az-summary">
            You made {decisions.length} decision{decisions.length > 1 ? 's' : ''}.{' '}
            {totalLoss < NEGLIGIBLE
              ? 'All of them matched the solver. Nice.'
              : `Total EV given up vs the solver: about ${bb(totalLoss)}.`}
          </p>
          <ul className="az-summary-list">
            {decisions.map((d, i) => (
              <li key={i} className={`fb-${GRADE_TEXT[d.grade].tone}`}>
                <b>{d.chosen.action.label}</b> — {GRADE_TEXT[d.grade].title}
                {d.loss >= NEGLIGIBLE && <> (−{bb(d.loss)})</>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="az-hint">Click any step in the line above to go back and try a different action.</p>
      <button className="btn btn-secondary" onClick={backToSetup}>Analyze another hand</button>
    </div>
  );
}

function RangePanel({ step, player }: { step: Step; player: number }) {
  const { solved, heroCards } = useAnalyzer();
  const s = solved!;
  const hero = s.spot.hero;
  const { node } = step;
  const cards = s.privateCards[player];
  // For the opponent's range, remove hands that use your cards (card removal).
  const [h1, h2] = heroCards;
  const dead = useMemo(() => (player === hero ? [] : [h1!, h2!]), [player, hero, h1, h2]);
  const acting = node.kind === 'action' && node.player === player;
  const numActions = acting ? step.actions.length : 0;
  const colors = acting ? actionColors(step.actions) : undefined;
  const names = acting ? step.actions.map(a => a.short) : undefined;

  const cells = useMemo(() => rangeGrid(node, player, cards, dead, numActions), [node, player, cards, numActions, dead]);
  const breakdown = useMemo(() => rangeBreakdown(node, player, cards, dead, numActions), [node, player, cards, numActions, dead]);
  const buckets = { strong: 0, medium: 0, weak: 0 };
  for (const r of breakdown) buckets[BUCKET[r.category]] += r.share;

  const highlight = player === hero ? gridPos(heroCards[0]!, heroCards[1]!) : null;

  return (
    <div className="az-range-panel">
      <RangeGrid cells={cells} colors={colors} actionNames={names} highlight={highlight} />
      {acting && colors && (
        <div className="az-legend">
          {step.actions.map((a, i) => (
            <span key={a.code}><i style={{ background: colors[i] }} />{a.short}</span>
          ))}
        </div>
      )}
      <div className="az-buckets" title="Strong = two pair or better · Medium = overpair / top pair · Weak = everything else">
        <span className="bk-strong" style={{ flex: buckets.strong }}>{buckets.strong > 0.08 && `${Math.round(buckets.strong * 100)}% strong`}</span>
        <span className="bk-medium" style={{ flex: buckets.medium }}>{buckets.medium > 0.08 && `${Math.round(buckets.medium * 100)}% medium`}</span>
        <span className="bk-weak" style={{ flex: buckets.weak }}>{buckets.weak > 0.08 && `${Math.round(buckets.weak * 100)}% weak`}</span>
      </div>
      <table className="az-breakdown">
        <thead>
          <tr>
            <th>{player === hero ? 'You have' : 'They have'}</th>
            <th>Share</th>
            {acting && <th>Plays it</th>}
          </tr>
        </thead>
        <tbody>
          {breakdown.map(r => (
            <tr key={r.category}>
              <td>{r.category}</td>
              <td>{(r.share * 100).toFixed(r.share < 0.1 ? 1 : 0)}%</td>
              {acting && r.freqs && colors && (
                <td>
                  <span className="az-mixbar">
                    {r.freqs.map((f, i) => (
                      <span key={i} style={{ width: `${f * 100}%`, background: colors[i] }} title={`${step.actions[i].short} ${Math.round(f * 100)}%`} />
                    ))}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
