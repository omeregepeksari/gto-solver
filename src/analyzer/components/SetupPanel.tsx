import { useMemo, useState } from 'react';
import { useAnalyzer, PRESETS, type Preset, type Street } from '../analyzerStore';

type AnalyzerState = ReturnType<typeof useAnalyzer.getState>;
import { POSITIONS, BB, type Position, type Spot } from '../spots';
import { RANK_CHARS, SUIT_CHARS, cardId, gridPos, handClass } from '../cards';
import { comboKey, gridWeights, parseRange, rangeSize } from '../range';
import { bb } from '../analysis';
import { MiniCard } from './MiniCard';
import { CardGrid } from './CardGrid';
import { RangeGrid } from './RangeGrid';

const SLOT_NAMES = ['Your card 1', 'Your card 2', 'Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];

function parseCards(text: string): number[] | null {
  const clean = text.replace(/[\s,]/g, '').replace(/10/g, 'T');
  if (clean.length % 2) return null;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const r = RANK_CHARS.indexOf(clean[i].toUpperCase());
    const s = SUIT_CHARS.indexOf(clean[i + 1].toLowerCase());
    if (r < 0 || s < 0) return null;
    const id = cardId(r, s);
    if (out.includes(id)) return null;
    out.push(id);
  }
  return out;
}

export function SetupPanel() {
  const st = useAnalyzer();
  const [activeSlot, setActiveSlot] = useState<number>(() => {
    if (st.heroCards[0] === null) return 0;
    if (st.heroCards[1] === null) return 1;
    return Math.min(2 + st.board.length, 6);
  });
  const [quick, setQuick] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Editing the setup by hand means it no longer matches a pasted hand.
  const edit = (patch: Partial<AnalyzerState>) => st.set({ ...patch, imported: null });
  const editSpot = (patch: Partial<AnalyzerState>) =>
    edit({
      ...patch,
      rangeOverride: [null, null],
      ...(st.imported ? { potOverride: null, stackOverride: null } : {}),
    });

  const slots: (number | null)[] = [st.heroCards[0], st.heroCards[1], ...Array.from({ length: 5 }, (_, i) => st.board[i] ?? null)];
  const used = slots.filter((c): c is number => c !== null);
  const spot = st.currentSpot();

  const setSlot = (slot: number, card: number | null) => {
    if (slot < 2) {
      const h: [number | null, number | null] = [...st.heroCards];
      h[slot] = card;
      edit({ heroCards: h });
    } else {
      const b = [...st.board];
      const i = slot - 2;
      if (card === null) b.splice(i); // removing a board card removes the later streets too
      else if (i <= b.length) b[i] = card;
      edit({ board: b });
    }
  };

  const pick = (card: number) => {
    // Board cards must be filled in order.
    const slot = activeSlot >= 2 ? Math.min(activeSlot, 2 + st.board.length) : activeSlot;
    setSlot(slot, card);
    const next = slots.findIndex((c, i) => c === null && i !== slot);
    setActiveSlot(next >= 0 ? next : slot);
  };

  const applyQuick = () => {
    const cards = parseCards(quick);
    if (!cards || cards.length < 2 || cards.length > 7) return;
    edit({ heroCards: [cards[0], cards[1]], board: cards.slice(2) });
    setActiveSlot(Math.min(cards.length, 6));
    setQuick('');
  };

  const streets: Street[] = (['flop', 'turn', 'river'] as Street[]).filter(
    (_, i) => st.board.length >= 3 + i,
  );
  const startStreet = streets.includes(st.startStreet) ? st.startStreet : 'flop';
  const heroOutOfRange = useMemo(() => {
    const [a, b] = st.heroCards;
    if (typeof spot === 'string' || a === null || b === null) return false;
    const r = parseRange(spot.ranges[spot.hero]);
    return typeof r !== 'string' && !(r.get(comboKey(a, b))! > 0);
  }, [spot, st.heroCards]);
  const ready = st.heroCards[0] !== null && st.heroCards[1] !== null && st.board.length >= 3 && typeof spot !== 'string';

  return (
    <div className="az-setup">
      <PasteHand />
      <div className="az-or">or set the hand up yourself</div>
      <section className="az-section">
        <h3><span className="az-num">1</span> Preflop</h3>
        <PositionRow label="You" value={st.heroPos} onChange={p => editSpot({ heroPos: p })} />
        <PositionRow label="Opponent" value={st.villainPos} onChange={p => editSpot({ villainPos: p })} />
        <div className="az-row">
          <span className="az-row-label">Pot</span>
          <div className="seg">
            <button className={st.potType === 'srp' ? 'on' : ''} onClick={() => editSpot({ potType: 'srp' })}>
              Raised & called
            </button>
            <button className={st.potType === '3bet' ? 'on' : ''} onClick={() => editSpot({ potType: '3bet' })}>
              3-bet pot
            </button>
            <button className={st.potType === '4bet' ? 'on' : ''} onClick={() => editSpot({ potType: '4bet' })}>
              4-bet pot
            </button>
          </div>
        </div>
        {typeof spot === 'string' ? (
          <p className="az-warn">{spot}</p>
        ) : (
          <p className="az-story">
            {spot.story}. Pot <b>{bb(spot.pot)}</b>, stacks <b>{bb(spot.stack)}</b>. You’re{' '}
            <b>{spot.hero === 1 ? 'in position' : 'out of position'}</b>.
          </p>
        )}
        {typeof spot !== 'string' && (
          <p className="az-hint az-source">
            {spot.source === 'solver'
              ? '✓ Ranges come from the preflop solver.'
              : `Ranges from a standard chart${spot.sourceNote ? ` — ${spot.sourceNote}` : '.'}`}
          </p>
        )}
        <div className="az-row">
          <span className="az-row-label">Rake</span>
          <div className="seg">
            <button className={st.rake === 'none' ? 'on' : ''} onClick={() => st.setRake('none')}>None</button>
            <button className={st.rake === 'rake' ? 'on' : ''} onClick={() => st.setRake('rake')}>5% (3bb cap)</button>
          </div>
        </div>
      </section>

      <section className="az-section">
        <h3><span className="az-num">2</span> Cards</h3>
        <div className="az-slots">
          <div className="az-slot-group">
            <span className="az-slot-label">Your hand</span>
            <div className="az-slot-cards">
              {[0, 1].map(i => (
                <MiniCard key={i} card={slots[i]} size="lg" active={activeSlot === i} onClick={() => setActiveSlot(i)} />
              ))}
            </div>
          </div>
          <div className="az-slot-group">
            <span className="az-slot-label">Board</span>
            <div className="az-slot-cards">
              {[2, 3, 4, 5, 6].map(i => (
                <MiniCard
                  key={i}
                  card={slots[i]}
                  size="lg"
                  active={activeSlot === i}
                  placeholder={i === 5 ? 'T' : i === 6 ? 'R' : '+'}
                  onClick={() => setActiveSlot(i)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="az-slot-hint">
          Picking: <b>{SLOT_NAMES[activeSlot]}</b>
          {slots[activeSlot] !== null && (
            <button className="link" onClick={() => setSlot(activeSlot, null)}>remove</button>
          )}
          <span className="spacer" />
          <input
            className="az-quick"
            placeholder="or type e.g. AsKd Td9d6h"
            value={quick}
            onChange={e => setQuick(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyQuick()}
            onBlur={applyQuick}
          />
        </div>
        <CardGrid used={used} onPick={pick} />
        {heroOutOfRange && (
          <p className="az-note az-note-top">
            {handClass(st.heroCards[0]!, st.heroCards[1]!)} isn’t in the usual {st.heroPos} range for this preflop line,
            so it may have been a preflop leak. You can still analyze it — the solver treats it as a rare hand in your range.
          </p>
        )}
      </section>

      <section className="az-section">
        <h3><span className="az-num">3</span> Solver</h3>
        <div className="az-row">
          <span className="az-row-label">Bet sizes</span>
          <div className="seg">
            {(Object.keys(PRESETS) as Preset[]).map(p => (
              <button key={p} className={st.preset === p ? 'on' : ''} onClick={() => st.set({ preset: p })}>
                {PRESETS[p].label}
              </button>
            ))}
          </div>
        </div>
        <p className="az-hint">{PRESETS[st.preset].hint}</p>
        {streets.length > 1 && (
          <>
            <div className="az-row">
              <span className="az-row-label">Start from</span>
              <div className="seg">
                {streets.map(s => (
                  <button key={s} className={startStreet === s ? 'on' : ''} onClick={() => st.set({ startStreet: s })}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <p className="az-hint">
              {startStreet === 'flop'
                ? 'Most accurate: the solver plays every street, so turn and river ranges are realistic.'
                : `Much faster, but the solver doesn't know what happened on earlier streets — set the pot below and narrow the ranges in Advanced for good results.`}
            </p>
          </>
        )}

        <button className="link az-adv-toggle" onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '▾' : '▸'} Advanced: ranges, pot & stacks
        </button>
        {showAdvanced && typeof spot !== 'string' && <Advanced spot={spot} />}
      </section>

      <div className="az-solve-bar">
        {st.error && <span className="az-warn">{st.error}</span>}
        <button
          className="btn btn-primary btn-large"
          disabled={!ready}
          onClick={() => {
            if (startStreet !== st.startStreet) st.set({ startStreet });
            st.solve();
          }}
        >
          Solve this hand
        </button>
      </div>
    </div>
  );
}

function PositionRow({ label, value, onChange }: { label: string; value: Position; onChange: (p: Position) => void }) {
  return (
    <div className="az-row">
      <span className="az-row-label">{label}</span>
      <div className="seg">
        {POSITIONS.map(p => (
          <button key={p} className={value === p ? 'on' : ''} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Advanced({ spot }: { spot: Spot }) {
  const st = useAnalyzer();
  const hero = spot.hero;
  const labels = hero === 0 ? ['Your range (OOP)', 'Their range (IP)'] : ['Their range (OOP)', 'Your range (IP)'];
  return (
    <div className="az-advanced">
      <div className="az-row">
        <label className="az-num-input">
          Pot (bb)
          <input
            type="number"
            min={1}
            step={0.5}
            value={spot.pot / BB}
            onChange={e => st.set({ potOverride: Math.max(1, Math.round(Number(e.target.value) * BB)) })}
          />
        </label>
        <label className="az-num-input">
          Effective stack (bb)
          <input
            type="number"
            min={1}
            step={0.5}
            value={spot.stack / BB}
            onChange={e => st.set({ stackOverride: Math.max(1, Math.round(Number(e.target.value) * BB)) })}
          />
        </label>
        {(st.potOverride !== null || st.stackOverride !== null) && (
          <button className="link" onClick={() => st.set({ potOverride: null, stackOverride: null })}>reset</button>
        )}
      </div>
      <div className="az-ranges">
        {[0, 1].map(p => (
          <RangeEditor
            key={p}
            label={labels[p]}
            value={spot.ranges[p]}
            heroCards={p === hero ? st.heroCards : null}
            edited={st.rangeOverride[p] !== null}
            onChange={v => {
              const o: [string | null, string | null] = [...st.rangeOverride];
              o[p] = v;
              st.set({ rangeOverride: o });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RangeEditor(props: {
  label: string;
  value: string;
  heroCards: [number | null, number | null] | null;
  edited: boolean;
  onChange: (v: string | null) => void;
}) {
  const parsed = useMemo(() => parseRange(props.value), [props.value]);
  const cells = useMemo(() => {
    if (typeof parsed === 'string') return null;
    const g = gridWeights(parsed);
    return Array.from(g, w => ({ weight: w, maxCombos: 1, freqs: null }));
  }, [parsed]);
  const h = props.heroCards;
  const highlight = h && h[0] !== null && h[1] !== null ? gridPos(h[0], h[1]) : null;
  return (
    <div className="az-range">
      <div className="az-range-head">
        <b>{props.label}</b>
        {typeof parsed !== 'string' && <span className="muted">{(rangeSize(parsed) * 100).toFixed(1)}% of hands</span>}
        {props.edited && <button className="link" onClick={() => props.onChange(null)}>reset</button>}
      </div>
      {cells && <RangeGrid cells={cells} highlight={highlight} />}
      <textarea value={props.value} onChange={e => props.onChange(e.target.value)} rows={3} spellCheck={false} />
      {typeof parsed === 'string' && <span className="az-warn">{parsed}</span>}
    </div>
  );
}

function PasteHand() {
  const importHand = useAnalyzer(s => s.importHand);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const analyze = (t: string) => {
    if (!t.trim()) return;
    setError(importHand(t));
  };
  return (
    <section className="az-section az-paste">
      <h3>Paste a hand from CoinPoker</h3>
      <p className="az-hint">
        Copy a hand’s text from CoinPoker’s hand history and paste it here — positions, cards, board, bet sizes and
        your line fill in automatically, and every decision you made gets graded.
      </p>
      <textarea
        rows={5}
        spellCheck={false}
        placeholder={'CoinPoker Hand #… Hold\'em No Limit (₮0.25/₮0.50)\n…\nDealt to Hero [As Qh]\n…'}
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={e => {
          const pasted = e.clipboardData.getData('text');
          setText(pasted);
          analyze(pasted);
          e.preventDefault();
        }}
      />
      <div className="az-paste-bar">
        {error && <span className="az-warn">{error}</span>}
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => analyze(text)}>
          Analyze hand
        </button>
      </div>
    </section>
  );
}
