import { useEffect, useMemo, useState } from 'react';
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
import { chartAt, type PreflopDecision } from '../preflop';
import { MiniCard } from './MiniCard';
import { CardGrid } from './CardGrid';
import { RangeGrid } from './RangeGrid';

const STREET_NAME = ['', '', '', 'Flop', 'Turn', 'River'];
/** EV differences under 0.05bb are noise. */
const NEGLIGIBLE = 0.05 * BB;

export function ReviewView() {
  const { solved, steps, cursor, setCursor, heroCards, villainPos, heroPos } = useAnalyzer();
  const [rangeTab, setRangeTab] = useState<'villain' | 'hero'>('villain');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const c = useAnalyzer.getState().cursor;
      if (e.key === 'ArrowLeft') setCursor(c - 1);
      if (e.key === 'ArrowRight') setCursor(c + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCursor]);

  const preflopNav = (
    <>
      <HandSummary />
      <div className="az-nav">
        <button className="btn btn-secondary btn-sm" disabled={cursor <= -1 || (cursor === 0 && !useAnalyzer.getState().preflopReview?.decisions.length)} onClick={() => setCursor(cursor - 1)}>
          ← Back
        </button>
        <Timeline steps={steps} cursor={cursor} hero={solved?.spot.hero ?? 0} villainName={villainPos} />
        <button className="btn btn-secondary btn-sm" disabled={cursor >= steps.length - 1} onClick={() => setCursor(cursor + 1)}>
          Next →
        </button>
      </div>
    </>
  );

  if (cursor < 0 || !solved || steps.length === 0) {
    return (
      <div className="az-review">
        {preflopNav}
        <PreflopReviewPanel />
      </div>
    );
  }

  const step = steps[Math.min(cursor, steps.length - 1)];
  const { node } = step;
  const hero = solved.spot.hero;
  const villain = 1 - hero;
  const h1 = heroCards[0]!;
  const h2 = heroCards[1]!;
  const prev = steps[cursor - 1];
  // Right after a decision, keep its verdict on screen while showing what comes next.
  const prevDecision = !step.decision && prev?.decision;

  return (
    <div className="az-review">
      {preflopNav}

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

          {prevDecision && <DecisionFeedback d={prevDecision} />}
          {step.decision && <DecisionFeedback d={step.decision} />}
          {step.note && <p className="az-note">{step.note}</p>}

          {node.kind === 'action' && node.player === hero && <HeroDecision step={step} />}
          {node.kind === 'action' && node.player === villain && <VillainDecision step={step} name={villainPos} />}
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

/** One-glance verdict for the whole hand, with a jump to the costliest decision. */
function HandSummary() {
  const { steps, setCursor, imported, replayStop, preflopReview } = useAnalyzer();
  const decided = [
    ...(preflopReview?.decisions.map(p => ({ d: p.decision, i: -1 })) ?? []),
    ...steps.map((s, i) => ({ d: s.decision, i })).filter((x): x is { d: Decision; i: number } => !!x.d),
  ];
  if (decided.length === 0 && !imported) return null;

  const good = decided.filter(x => GRADE_TEXT[x.d.grade].tone === 'good').length;
  const bad = decided.filter(x => GRADE_TEXT[x.d.grade].tone === 'bad').length;
  const ok = decided.length - good - bad;
  const totalLoss = decided.reduce((a, x) => a + x.d.loss, 0);
  const worst = decided.reduce<(typeof decided)[number] | null>((w, x) => (!w || x.d.loss > w.d.loss ? x : w), null);
  const worstStreet = worst ? (worst.i < 0 ? 'Preflop' : STREET_NAME[steps[worst.i].node.board.length]) : '';

  let verdict: string;
  if (decided.length === 0) verdict = 'No decisions of yours to grade in this line.';
  else if (totalLoss < NEGLIGIBLE * 2 && bad === 0) verdict = 'You played this hand like the solver. Nice.';
  else if (bad === 0) verdict = `Solid — only small deviations (about ${bb(totalLoss)} total).`;
  else verdict = `${bad} costly mistake${bad > 1 ? 's' : ''} — about ${bb(totalLoss)} given up vs the solver.`;

  return (
    <div className={`az-hand-summary ${bad ? 'fb-bad' : ok ? 'fb-ok' : 'fb-good'}`}>
      <div className="hs-main">
        <div>
          <div className="hs-verdict">{verdict}</div>
          <div className="hs-counts">
            {imported?.story && <span>{imported.story}</span>}
            {decided.length > 0 && (
              <span>
                {decided.length} decision{decided.length > 1 ? 's' : ''}: {good} good
                {ok > 0 && `, ${ok} okay`}
                {bad > 0 && `, ${bad} mistake${bad > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        </div>
        {worst && worst.d.loss >= NEGLIGIBLE && (
          <button className="btn btn-secondary btn-sm" onClick={() => setCursor(worst.i)}>
            Biggest leak: {worstStreet.toLowerCase()} {worst.d.chosen.action.short.toLowerCase()} (−{bb(worst.d.loss)}) →
          </button>
        )}
      </div>
      {imported?.warnings.map(w => <p key={w} className="hs-warn">{w}</p>)}
      {replayStop && <p className="hs-warn">Replay stopped: {replayStop} You can continue by hand from there.</p>}
      {imported?.preflopOnly && <p className="hs-warn">{imported.preflopOnly} Only preflop is reviewed.</p>}
    </div>
  );
}

function Timeline({ steps, cursor, hero, villainName }: { steps: Step[]; cursor: number; hero: number; villainName: string }) {
  const { setCursor, preflopReview } = useAnalyzer();
  const items: { key: string; label: string; stepIdx: number; cls: string }[] = [];
  if (preflopReview?.decisions.length) {
    const tones = preflopReview.decisions.map(p => GRADE_TEXT[p.decision.grade].tone);
    const tone = tones.includes('bad') ? 'bad' : tones.includes('ok') ? 'ok' : 'good';
    items.push({ key: 'pre', label: 'Preflop', stepIdx: -1, cls: `tl-action tl-${tone}` });
  }
  steps.forEach((s, i) => {
    if (i === 0) {
      items.push({ key: 'start', label: `${STREET_NAME[s.node.board.length]} ${s.node.board.map(cardLabel).join(' ')}`, stepIdx: 0, cls: 'tl-street' });
    }
    if (s.chosen === undefined) return;
    if (s.node.kind === 'chance') {
      items.push({ key: `c${i}`, label: `${STREET_NAME[s.node.board.length + 1]} ${cardLabel(s.chosen)}`, stepIdx: i + 1, cls: 'tl-street' });
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
        <button
          key={it.key}
          className={`tl-item ${it.cls}${it.stepIdx === cursor ? ' tl-current' : ''}`}
          onClick={() => setCursor(it.stepIdx)}
        >
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
        {g.tone === 'good' ? '✓' : g.tone === 'ok' ? '~' : '✗'} You: {d.chosen.action.label} · {g.title}
      </div>
      <div className="fb-body">
        {d.grade === 'best' && <>The solver does this {Math.round(d.chosen.freq * 100)}% of the time with your hand.</>}

        {d.grade !== 'best' && (
          <>
            Solver: <b>{d.best.action.label}</b> ({Math.round(d.best.freq * 100)}%)
            {d.bestEv !== d.best && d.bestEv.evVsBest - d.best.evVsBest >= NEGLIGIBLE && (
              <>, best EV: <b>{d.bestEv.action.label}</b></>
            )}
            . You chose an action it takes{' '}
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
        {d.unsettled && (
          <div className="fb-unsettled">
            This line is rare, so the solver’s mix here isn’t fully settled — go by the EV numbers.
          </div>
        )}
      </div>
    </div>
  );
}

/** Label for the per-row button: what it means depends on whether this spot was already played. */
function rowButton(step: Step, i: number, isHero: boolean): string | null {
  if (step.chosen === undefined) return isHero ? 'I did this' : 'They did this';
  if (step.chosen === i) return null;
  return isHero ? 'Try this instead' : 'What if?';
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
  else if (second && second.freq > 0.25) {
    const gap = Math.abs(top.evVsBest - second.evVsBest);
    summary = `Mixed spot: ${top.action.short.toLowerCase()} ${Math.round(top.freq * 100)}% / ${second.action.short.toLowerCase()} ${Math.round(second.freq * 100)}%.`;
    summary +=
      gap < 0.02 * step.node.pot
        ? ' Both are fine — the EVs are almost equal.'
        : ` The EVs aren’t equal yet (rare spot), so lean towards the best-EV option.`;
  }
  else summary = `Mostly ${top.action.short.toLowerCase()} (${Math.round(top.freq * 100)}%).`;

  return (
    <div className="az-panel">
      <div className="az-panel-head">
        <h3>{step.chosen === undefined ? 'Your move' : 'Your decision here'}</h3>
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
        {view.options.map((o, i) => {
          const label = rowButton(step, i, true);
          return (
            <div key={o.action.code} className={`az-option${step.chosen === i ? ' az-option-chosen' : ''}`}>
              <span className="az-dot" style={{ background: colors[i] }} />
              <span className="az-option-name">
                {o.action.label}
                {step.chosen === i && <em className="az-you">you</em>}
              </span>
              <span className="az-bar">
                <span style={{ width: `${o.freq * 100}%`, background: colors[i] }} />
              </span>
              <span className="az-freq">{Math.round(o.freq * 100)}%</span>
              <span className={`az-ev ${o.evVsBest > -NEGLIGIBLE ? 'ev-best' : ''}`}>
                {o.evVsBest > -NEGLIGIBLE ? 'best EV' : `−${bb(-o.evVsBest)}`}
              </span>
              {label ? (
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => choose(i)}>
                  {label}
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
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
        <h3>{step.chosen === undefined ? `${name} to act — what did they do?` : `${name}’s decision`}</h3>
      </div>
      <p className="az-summary">How {name} plays their whole range here (knowing you hold your cards):</p>
      <div className="az-options">
        {step.actions.map((a, i) => {
          const label = rowButton(step, i, false);
          return (
            <div key={a.code} className={`az-option${step.chosen === i ? ' az-option-chosen' : ''}`}>
              <span className="az-dot" style={{ background: colors[i] }} />
              <span className="az-option-name">
                {a.label}
                {step.chosen === i && <em className="az-you">they did</em>}
              </span>
              <span className="az-bar">
                <span style={{ width: `${freqs[i] * 100}%`, background: colors[i] }} />
              </span>
              <span className="az-freq">{Math.round(freqs[i] * 100)}%</span>
              <span />
              {label ? (
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => choose(i)}>
                  {label}
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
      <p className="az-hint">The table on the right shows which hands take each line.</p>
    </div>
  );
}

function DealCard({ step }: { step: Step }) {
  const { choose, heroCards, busy } = useAnalyzer();
  const street = STREET_NAME[step.node.board.length + 1];
  return (
    <div className="az-panel">
      <div className="az-panel-head">
        <h3>
          {step.chosen === undefined
            ? `Which ${street.toLowerCase()} card came?`
            : `${street}: ${cardLabel(step.chosen)} — pick another card to see a different runout`}
        </h3>
      </div>
      <CardGrid
        used={[...step.node.board, heroCards[0]!, heroCards[1]!]}
        allowed={step.node.possibleCards}
        onPick={c => !busy && c !== step.chosen && choose(c)}
      />
    </div>
  );
}

function HandOver({ steps, hero, villainName }: { steps: Step[]; hero: number; villainName: string }) {
  const { backToSetup, setCursor } = useAnalyzer();
  const decided = steps.map((s, i) => ({ d: s.decision, i })).filter((x): x is { d: Decision; i: number } => !!x.d);
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
      {decided.length > 0 && (
        <ul className="az-summary-list">
          {decided.map(({ d, i }) => (
            <li key={i} className={`fb-${GRADE_TEXT[d.grade].tone}`}>
              <button className="link" onClick={() => setCursor(i)}>
                {STREET_NAME[steps[i].node.board.length]}: <b>{d.chosen.action.label}</b>
              </button>{' '}
              — {GRADE_TEXT[d.grade].title}
              {d.loss >= NEGLIGIBLE && <> (−{bb(d.loss)})</>}
            </li>
          ))}
        </ul>
      )}
      <p className="az-hint">Use Back / Next (or ← →) to step through the hand, and “Try this instead” to explore other lines.</p>
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

/** Your preflop decisions from a pasted hand, each with the solver's chart for that spot. */
function PreflopReviewPanel() {
  const { preflopReview, preflop, heroCards } = useAnalyzer();
  const [selected, setSelected] = useState(0);
  if (!preflopReview || !preflop) return null;
  const { decisions, stop } = preflopReview;
  const current: PreflopDecision | undefined = decisions[Math.min(selected, decisions.length - 1)];
  const chart = current ? chartAt(preflop, current.node) : null;
  const colors = current ? actionColors(current.options.map(o => o.action)) : [];
  const h1 = heroCards[0];
  const h2 = heroCards[1];

  return (
    <div className="az-review-grid">
      <div className="az-main">
        {h1 !== null && h2 !== null && (
          <div className="az-hero-hand az-hero-hand-flat">
            <MiniCard card={h1} size="md" />
            <MiniCard card={h2} size="md" />
            <span>Your preflop decisions</span>
          </div>
        )}
        {decisions.map((p, i) => (
          <div
            key={i}
            className={`az-panel pf-decision${i === selected ? ' pf-decision-on' : ''}`}
            onClick={() => setSelected(i)}
          >
            <DecisionFeedback d={p.decision} />
            <div className="az-options">
              {p.options.map((o, a) => (
                <div key={o.action.code} className={`az-option${o === p.decision.chosen ? ' az-option-chosen' : ''}`}>
                  <span className="az-dot" style={{ background: actionColors(p.options.map(x => x.action))[a] }} />
                  <span className="az-option-name">
                    {o.action.label}
                    {o === p.decision.chosen && <em className="az-you">you</em>}
                  </span>
                  <span className="az-bar">
                    <span style={{ width: `${o.freq * 100}%`, background: actionColors(p.options.map(x => x.action))[a] }} />
                  </span>
                  <span className="az-freq">{Math.round(o.freq * 100)}%</span>
                  <span className={`az-ev ${o.evVsBest > -NEGLIGIBLE ? 'ev-best' : ''}`}>
                    {o.evVsBest > -NEGLIGIBLE ? 'best EV' : `−${bb(-o.evVsBest)}`}
                  </span>
                  <span />
                </div>
              ))}
            </div>
          </div>
        ))}
        {stop && <p className="az-note">Preflop grading stopped: {stop}</p>}
      </div>
      {chart && current && (
        <aside className="az-side">
          <h3 className="pf-side-title">Solver’s range in this spot</h3>
          <RangeGrid
            cells={chart.freqs.map(f => ({ weight: 1, maxCombos: 1, freqs: f }))}
            colors={colors}
            actionNames={chart.actions}
            highlight={[Math.floor(current.hand / 13), current.hand % 13]}
          />
          <div className="az-legend">
            {chart.actions.map((a, i) => (
              <span key={a}>
                <i style={{ background: colors[i] }} />
                {a} {(chart.totals[i] * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
