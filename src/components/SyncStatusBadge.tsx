import type { SyncStatus } from '../utils/useSyncManager';

export default function SyncStatusBadge({
  status,
  pendingCount,
}: {
  status: SyncStatus;
  pendingCount: number;
}) {
  const config: Record<SyncStatus, { emoji: string; label: string; className: string }> = {
    online: {
      emoji: '🟢',
      label: 'Sincronizado',
      className: 'bg-emerald-50 text-emerald-700',
    },
    syncing: {
      emoji: '🔵',
      label: pendingCount > 0 ? `Sincronizando (${pendingCount})…` : 'Sincronizando…',
      className: 'bg-sky-50 text-sky-700',
    },
    offline: {
      emoji: '🟡',
      label:
        pendingCount > 0
          ? `Offline — ${pendingCount} pendente${pendingCount !== 1 ? 's' : ''}`
          : 'Offline',
      className: 'bg-amber-50 text-amber-700',
    },
  };

  const c = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${c.className}`}
    >
      <span aria-hidden>{c.emoji}</span>
      {c.label}
    </span>
  );
}
