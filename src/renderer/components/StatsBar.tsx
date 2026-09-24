import type { QueueStats } from '../damApi';

interface StatsBarProps {
  stats: QueueStats | null;
}

const PILLS: Array<{ key: keyof Omit<QueueStats, 'total'>; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'changesRequested', label: 'Changes requested' },
];

export function StatsBar({ stats }: StatsBarProps): JSX.Element {
  const values = stats ?? {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    changesRequested: 0,
  };

  return (
    <div className="stats-bar" role="status" aria-label="Queue statistics">
      <span className="stats-total">
        <strong>{values.total}</strong> in queue
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
