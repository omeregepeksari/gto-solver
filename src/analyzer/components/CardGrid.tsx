import { cardId } from '../cards';
import { MiniCard } from './MiniCard';

interface Props {
  /** Cards that can't be picked (already used). */
  used: number[];
  /** If set, only these cards can be picked. */
  allowed?: number[];
  onPick: (card: number) => void;
}

const SUIT_ORDER = [3, 2, 1, 0]; // ♠ ♥ ♦ ♣

/** All 52 cards, one row per suit, aces first. */
export function CardGrid({ used, allowed, onPick }: Props) {
  return (
    <div className="card-grid">
      {SUIT_ORDER.map(suit => (
        <div className="card-grid-row" key={suit}>
          {Array.from({ length: 13 }, (_, i) => {
            const id = cardId(12 - i, suit);
            const disabled = used.includes(id) || (allowed !== undefined && !allowed.includes(id));
            return (
              <MiniCard key={id} card={id} size="sm" dim={disabled} onClick={disabled ? undefined : () => onPick(id)} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
