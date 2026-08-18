import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { db, getPendingSyncCount, type SyncQueueItem } from './localDb';

export type SyncStatus = 'online' | 'offline' | 'syncing';

/**
 * Gerencia o ciclo de vida da sincronização entre a fila local (IndexedDB)
 * e o Supabase.
 *
 * - offline: navigator.onLine === false → mutações só vão para a fila local.
 * - syncing: online, mas há itens pendentes sendo drenados agora.
 * - online: online e fila vazia (tudo sincronizado).
 */
export function useSyncManager() {
  const [status, setStatus] = useState<SyncStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  );
  const [pendingCount, setPendingCount] = useState(0);
  const drainingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
    return count;
  }, []);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    drainingRef.current = true;
    setStatus('syncing');

    try {
      // Processa em ordem de criação, uma a uma, para não gerar corrida
      // entre updates concorrentes na mesma linha.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const next: SyncQueueItem | undefined = await db.sync_queue
          .orderBy('createdAt')
          .first();
        if (!next) break;

        try {
          const query = supabase.from(next.table).update(next.patch as any);
          let withMatch = query;
          for (const [key, value] of Object.entries(next.match)) {
            withMatch = withMatch.eq(key, value as any);
          }
          const { error } = await withMatch;
          if (error) throw error;

          if (next.id !== undefined) await db.sync_queue.delete(next.id);
        } catch (err) {
          console.error('Falha ao sincronizar item da fila, tentando novamente depois:', err);
          // Sai do loop; tentaremos de novo no próximo evento de conexão/timer.
          break;
        }

        await refreshPendingCount();
      }
    } finally {
      drainingRef.current = false;
      const remaining = await refreshPendingCount();
      setStatus(remaining === 0 ? 'online' : 'offline');
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();

    const handleOnline = () => {
      setStatus('syncing');
      drainQueue();
    };
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Tenta drenar periodicamente também (cobre casos em que o navegador
    // não dispara 'online' de forma confiável, ex: rede instável em wifi de escola).
    const interval = setInterval(() => {
      if (navigator.onLine) drainQueue();
    }, 15000);

    // Tentativa inicial
    if (navigator.onLine) drainQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [drainQueue, refreshPendingCount]);

  return { status, pendingCount, drainQueue };
}
