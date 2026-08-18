import { useCallback, useRef, useState } from 'react';
import { enqueueSync } from './localDb';
import type { GradeRow, ClassEnrollmentRow } from '../types/database';

export type CellSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Hook de autosave por célula com debounce de 800ms.
 *
 * A cada edição, o valor é gravado imediatamente na fila local (IndexedDB) —
 * funciona 100% offline. O `useSyncManager` (em outro hook) é responsável
 * por drenar essa fila para o Supabase assim que há conexão. O status
 * exibido aqui ('saving' → 'saved') reflete a gravação *local*, não a
 * confirmação do servidor — a confirmação real é responsabilidade do
 * indicador de sincronização global na barra superior.
 */
export function useGradeAutosave() {
  const [statusByKey, setStatusByKey] = useState<Record<string, CellSaveStatus>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const runDebounced = useCallback((cellKey: string, task: () => Promise<void>) => {
    setStatusByKey((prev) => ({ ...prev, [cellKey]: 'saving' }));

    if (timers.current[cellKey]) {
      clearTimeout(timers.current[cellKey]);
    }

    timers.current[cellKey] = setTimeout(async () => {
      try {
        await task();
        setStatusByKey((prev) => ({ ...prev, [cellKey]: 'saved' }));
        setTimeout(() => {
          setStatusByKey((prev) =>
            prev[cellKey] === 'saved' ? { ...prev, [cellKey]: 'idle' } : prev
          );
        }, 2000);
      } catch (err) {
        console.error('Erro ao salvar nota localmente:', err);
        setStatusByKey((prev) => ({ ...prev, [cellKey]: 'error' }));
      }
    }, 800);
  }, []);

  /** Salva um campo da tabela `grades` (valor por aluno + etapa). */
  const scheduleSave = useCallback(
    (cellKey: string, enrollmentId: string, etapa: number, patch: Partial<GradeRow>) => {
      runDebounced(cellKey, async () => {
        await enqueueSync({
          table: 'grades',
          match: { enrollment_id: enrollmentId, etapa },
          patch,
          cellKey,
        });
      });
    },
    [runDebounced]
  );

  /**
   * Salva um campo da tabela `class_enrollments` (valor único por aluno na
   * turma, ex: nota_prova_final — avaliação aplicada após todas as etapas).
   */
  const scheduleEnrollmentSave = useCallback(
    (cellKey: string, enrollmentId: string, patch: Partial<ClassEnrollmentRow>) => {
      runDebounced(cellKey, async () => {
        await enqueueSync({
          table: 'class_enrollments',
          match: { id: enrollmentId },
          patch,
          cellKey,
        });
      });
    },
    [runDebounced]
  );

  return { statusByKey, scheduleSave, scheduleEnrollmentSave };
}
