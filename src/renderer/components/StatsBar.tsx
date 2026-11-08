import type { QueueStats } from '../damApi';

interface StatsBarProps {
  stats: QueueStats | null;
}

const PILLS: Array<{ key: keyof Omit<QueueStats, 'total'>; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'love', label: 'Love' },
  { key: 'keep', label: 'Keep' },
  { key: 'reject', label: 'Reject' },
  { key: 'changesRequested', label: 'Changes' },
];

export function StatsBar({ stats }: StatsBarProps): JSX.Element {
  const values = stats ?? {
    total: 0,
    pending: 0,
    love: 0,
    keep: 0,
    reject: 0,
    changesRequested: 0,
  };

  return (
    <div className="stats-bar" role="status" aria-label="Queue statistics">
      <span className="stats-total">
        <strong>{values.total}</strong> in gallery
      </span>
      <ul className="stats-pills">
        {PILLS.map(({ key, label }) => (
          <li key={key} className={`stat-pill stat-pill--${key}`}>
            <span className="stat-pill__count">{values[key]}</span>
            <span className="stat-pill__label">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
