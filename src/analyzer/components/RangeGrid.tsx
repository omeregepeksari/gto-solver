import { useState } from 'react';
import { gridLabel } from '../cards';
import type { GridCell } from '../analysis';

interface Props {
  /** 169 cells, row-major, row 0 = Ace. */
  cells: GridCell[];
  /** One color per action, when cells carry action frequencies. */
  colors?: string[];
  actionNames?: string[];
  highlight?: [number, number] | null;
  baseColor?: string;
}

/**
 * The classic 13x13 hand chart. Fill height shows how much of each hand is still in the range;
 * when a player is acting, the fill is split left-to-right by how often each action is taken.
 */
export function RangeGrid({ cells, colors, actionNames, highlight, baseColor = 'var(--gold)' }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const hovered = hover !== null ? cells[hover] : null;

  return (
    <div className="range-grid-wrap">
      <div className="range-grid" onMouseLeave={() => setHover(null)}>
        {cells.map((cell, idx) => {
          const row = Math.floor(idx / 13);
          const col = idx % 13;
          const fill = cell.maxCombos > 0 ? Math.min(1, cell.weight / cell.maxCombos) : 0;
          const isHero = highlight && highlight[0] === row && highlight[1] === col;
          return (
            <div
              key={idx}
              className={`rg-cell${isHero ? ' rg-hero' : ''}${fill < 0.005 ? ' rg-empty' : ''}`}
              onMouseEnter={() => setHover(idx)}
            >
              <div className="rg-fill" style={{ height: `${fill * 100}%` }}>
                {cell.freqs && colors ? (
                  cell.freqs.map((f, a) => (
                    <div key={a} style={{ width: `${f * 100}%`, background: colors[a] }} />
                  ))
                ) : (
                  <div style={{ width: '100%', background: baseColor }} />
                )}
              </div>
              <span className="rg-label">{gridLabel(row, col)}</span>
            </div>
          );
        })}
      </div>
      <div className="rg-tooltip">
        {hovered && hover !== null ? (
          <>
            <strong>{gridLabel(Math.floor(hover / 13), hover % 13)}</strong>
            <span>
              {hovered.weight.toFixed(1)} of {hovered.maxCombos} combos
            </span>
            {hovered.freqs && actionNames && colors &&
              hovered.freqs.map((f, a) =>
                f > 0.005 ? (
                  <span key={a} className="rg-tip-action">
                    <i style={{ background: colors[a] }} /> {actionNames[a]} {Math.round(f * 100)}%
                  </span>
                ) : null,
              )}
          </>
        ) : (
          <span className="muted">Hover a hand for details</span>
        )}
      </div>
    </div>
  );
}
