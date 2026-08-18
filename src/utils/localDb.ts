import Dexie, { type Table } from 'dexie';
import type { GradeRow, ClassEnrollmentRow } from '../types/database';

/**
 * Camada de persistência local (IndexedDB via Dexie).
 *
 * `local_grades` e `local_enrollments` são espelhos locais dos dados
 * exibidos na Grid — usados para renderizar instantaneamente e para
 * funcionar 100% offline.
 *
 * `sync_queue` é a fila de mutações pendentes: toda edição de nota gera
 * uma entrada aqui, e o SyncManager tenta drenar essa fila sempre que
 * há conexão. Nada é perdido entre ficar offline e voltar a ficar online.
 */

export type SyncTable = 'grades' | 'class_enrollments';

export interface SyncQueueItem {
  id?: number;
  table: SyncTable;
  /** Chave usada para localizar a linha a atualizar. */
  match: Record<string, string | number>;
  /** Campos a atualizar (patch parcial). */
  patch: Record<string, unknown>;
  /** Timestamp de criação — usado para aplicar mutações na ordem certa. */
  createdAt: number;
  /** Chave lógica da célula/linha, para colapsar edições repetidas da mesma célula. */
  cellKey: string;
}

class AppDatabase extends Dexie {
  local_grades!: Table<GradeRow & { enrollment_etapa: string }, string>;
  local_enrollments!: Table<ClassEnrollmentRow, string>;
  local_classes!: Table<import('../types/database').ClassRow, string>;
  sync_queue!: Table<SyncQueueItem, number>;

  constructor() {
    super('ifs_turmas_db');
    this.version(1).stores({
      // enrollment_etapa = `${enrollment_id}:${etapa}` — chave composta indexável
      local_grades: 'id, enrollment_etapa, enrollment_id, etapa',
      local_enrollments: 'id, class_id',
      local_classes: 'id',
      // cellKey como índice permite substituir (colapsar) edições pendentes da mesma célula
      sync_queue: '++id, cellKey, createdAt',
    });
  }
}

export const db = new AppDatabase();

/**
 * Enfileira uma mutação para sincronização, colapsando qualquer mutação
 * pendente anterior da mesma célula (cellKey) — evita reenviar N updates
 * intermediários quando o usuário edita a mesma célula várias vezes antes
 * de a conexão voltar.
 */
export async function enqueueSync(item: Omit<SyncQueueItem, 'id' | 'createdAt'>) {
  await db.transaction('rw', db.sync_queue, async () => {
    const existing = await db.sync_queue.where('cellKey').equals(item.cellKey).toArray();
    for (const e of existing) {
      if (e.id !== undefined) await db.sync_queue.delete(e.id);
    }
    await db.sync_queue.add({ ...item, createdAt: Date.now() });
  });
}

export async function getPendingSyncCount(): Promise<number> {
  return db.sync_queue.count();
}
