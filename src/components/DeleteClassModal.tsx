import { useState } from 'react';
import Modal from './Modal';
import { supabase } from '../utils/supabaseClient';
import type { ClassRow } from '../types/database';

interface DeleteClassModalProps {
  classData: ClassRow;
  /** Quando conhecido, usado para simplificar a confirmação de turmas vazias. */
  totalAlunos?: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteClassModal({
  classData,
  totalAlunos,
  onClose,
  onDeleted,
}: DeleteClassModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // Turma sem nenhum aluno matriculado (comum em cadastros de teste):
  // não há dados de aluno/nota em risco, então dispensamos a exigência
  // de digitar "APAGAR" e deixamos a confirmação de um clique só.
  const isEmptyClass = totalAlunos === 0;
  const canDelete = isEmptyClass || confirmText.trim().toUpperCase() === 'APAGAR';

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      // ON DELETE CASCADE no schema já remove class_enrollments e grades
      // relacionados automaticamente ao apagar a turma (funciona igual
      // com ou sem alunos matriculados).
      const { error: deleteErr } = await supabase.from('classes').delete().eq('id', classData.id);
      if (deleteErr) throw deleteErr;
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao apagar a turma.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="text-3xl">⚠️</div>
        <h2 className="text-base font-semibold text-stone-900">Apagar turma permanentemente?</h2>
        <p className="text-sm text-stone-500">
          {isEmptyClass ? (
            <>
              Esta turma (<strong>{classData.nome_disciplina}</strong>, {classData.codigo_turma})
              ainda não tem nenhum aluno matriculado. Apagar é definitivo e não pode ser desfeito.
            </>
          ) : (
            <>
              Esta ação vai apagar <strong>{classData.nome_disciplina}</strong> (
              {classData.codigo_turma}), incluindo todos os alunos matriculados e notas lançadas.
              Isso não pode ser desfeito.
            </>
          )}
        </p>

        {!isEmptyClass && (
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
            Digite APAGAR para confirmar
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="APAGAR"
              autoFocus
            />
          </label>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white active:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Apagando…' : 'Apagar definitivamente'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
