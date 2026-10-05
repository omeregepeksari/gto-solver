import { useGameStore } from '../../store/gameStore';
import { useAnalyzer } from '../analyzerStore';
import { SetupPanel } from './SetupPanel';
import { ReviewView } from './ReviewView';
import '../analyzer.css';

export function HandAnalyzer() {
  const setScreen = useGameStore(s => s.setScreen);
  const { status, solved, backToSetup } = useAnalyzer();

  return (
    <div className="analyzer">
      <header className="az-header">
        <button className="btn-back" onClick={() => setScreen('menu')}>☰ Menu</button>
        <h2>Hand Analyzer</h2>
        {status === 'review' && solved && (
          <>
            <span className="az-solve-info" title="Exploitability: how much a perfect opponent could win against this solution. Lower = closer to true GTO.">
              Solved in {(solved.elapsedMs / 1000).toFixed(1)}s on {solved.threads} thread{solved.threads > 1 ? 's' : ''} · accuracy {solved.exploitPct.toFixed(2)}% of pot
            </span>
            <button className="btn btn-secondary btn-sm" onClick={backToSetup}>Edit hand</button>
          </>
        )}
      </header>
      <main className="az-body">
        {(status === 'setup' || status === 'error') && <SetupPanel />}
        {status === 'solving' && <SolvingView />}
        {status === 'review' && <ReviewView />}
      </main>
    </div>
  );
}

function SolvingView() {
  const { progress, stop, cancel } = useAnalyzer();
  if (!progress) return null;
  const { iteration, exploitPct, elapsedMs, target } = progress;
  // Exploitability falls roughly log-linearly; show progress on a log scale from 100% of pot to the target.
  const pct = Number.isFinite(exploitPct)
    ? Math.min(1, Math.max(0, Math.log(100 / exploitPct) / Math.log(100 / target)))
    : 0;
  return (
    <div className="az-solving">
      <div className="spinner" />
      <h3>Solving…</h3>
      <p className="muted">
        The solver plays the spot against itself over and over until neither side can improve.
      </p>
      <div className="az-progress">
        <span style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="az-progress-text">
        {iteration} iterations · {(elapsedMs / 1000).toFixed(0)}s
        {Number.isFinite(exploitPct) && <> · accuracy {exploitPct.toFixed(2)}% of pot (target {target}%)</>}
        {pct > 0.2 && pct < 1 && <> · about {Math.ceil((elapsedMs * (1 - pct)) / pct / 1000)}s left</>}
      </p>
      <div className="az-solving-actions">
        <button className="btn btn-primary" onClick={stop} disabled={iteration < 5}>
          Good enough — show results
        </button>
        <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}
