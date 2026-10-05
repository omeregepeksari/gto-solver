import { RANK_CHARS, SUIT_SYMBOLS, rankOf, suitOf } from '../cards';

interface Props {
  card: number | null;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  active?: boolean;
  dim?: boolean;
  placeholder?: string;
}

/** Four-color deck card (♠ black, ♥ red, ♦ blue, ♣ green) — easier to read at a glance. */
export function MiniCard({ card, size = 'md', onClick, active, dim, placeholder }: Props) {
  const cls = `mc mc-${size}${active ? ' mc-active' : ''}${dim ? ' mc-dim' : ''}${onClick ? ' mc-click' : ''}`;
  if (card === null) {
    return (
      <button type="button" className={`${cls} mc-empty`} onClick={onClick} disabled={!onClick}>
        {placeholder ?? '+'}
      </button>
    );
  }
  const rank = RANK_CHARS[rankOf(card)];
  return (
    <button type="button" className={`${cls} mc-suit-${suitOf(card)}`} onClick={onClick} disabled={!onClick}>
      <span className="mc-rank">{rank}</span>
      <span className="mc-sym">{SUIT_SYMBOLS[suitOf(card)]}</span>
    </button>
  );
}
