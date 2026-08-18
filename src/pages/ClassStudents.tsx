import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import type { ClassRow, SubturmaRow } from '../types/database';

interface StudentEnrollment {
  enrollmentId: string;
  studentId: string;
  nome: string;
  matricula: string;
  subturmaId: string | null;
}

interface ClassStudentsProps {
  classId: string;
  onBack: () => void;
}

export default function ClassStudents({ classId, onBack }: ClassStudentsProps) {
  const [classData, setClassData] = useState<ClassRow | null>(null);
  const [students, setStudents] = useState<StudentEnrollment[]>([]);
  const [subturmas, setSubturmas] = useState<SubturmaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDivideModal, setShowDivideModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: cls, error: clsErr }, { data: subs, error: subsErr }] = await Promise.all([
        supabase.from('classes').select('*').eq('id', classId).single(),
        supabase.from('subturmas').select('*').eq('class_id', classId).order('nome'),
      ]);
      if (clsErr) throw clsErr;
      if (subsErr) throw subsErr;
      setClassData(cls);
      setSubturmas(subs ?? []);

      const { data: enrollments, error: enrollErr } = await supabase
        .from('class_enrollments')
        .select('id, student_id, subturma_id, students(nome, matricula)')
        .eq('class_id', classId);
      if (enrollErr) throw enrollErr;

      const rows: StudentEnrollment[] = (enrollments ?? []).map((e: any) => ({
        enrollmentId: e.id,
        studentId: e.student_id,
        nome: e.students?.nome ?? '(sem nome)',
        matricula: e.students?.matricula ?? '',
        subturmaId: e.subturma_id,
      }));
      rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setStudents(rows);
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao carregar alunos da turma.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const assignSubturma = async (enrollmentId: string, subturmaId: string | null) => {
    // Atualização otimista
    setStudents((prev) =>
      prev.map((s) => (s.enrollmentId === enrollmentId ? { ...s, subturmaId } : s))
    );
    const { error: updateErr } = await supabase
      .from('class_enrollments')
      .update({ subturma_id: subturmaId })
      .eq('id', enrollmentId);
    if (updateErr) {
      console.error('Erro ao mover aluno de subturma:', updateErr);
      loadData(); // reverte em caso de falha
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !classData) {
    return (
      <div className="min-h-screen bg-stone-50 p-4">
        <button onClick={onBack} className="mb-3 text-xs text-stone-400">← Voltar</button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? 'Turma não encontrada.'}
        </div>
      </div>
    );
  }

  const semSubturma = students.filter((s) => s.subturmaId === null);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-3 md:px-8">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-3">
              <button
                onClick={onBack}
                aria-label="Voltar"
                className="-ml-1 flex shrink-0 items-center rounded-xl px-2 py-1 text-2xl font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-emerald-700 focus:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <span aria-hidden className="leading-none">←</span>
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-stone-900 md:text-base">
                  {classData.nome_disciplina}
                </h1>
                <p className="text-xs text-stone-400 md:text-sm">
                  {students.length} aluno{students.length !== 1 ? 's' : ''} · Alunos e Subturmas
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDivideModal(true)}
              className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white active:bg-emerald-800 md:px-4 md:py-2.5 md:text-sm"
            >
              + Dividir Turma
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1800px] px-4 pt-4 md:px-8">
        {subturmas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <div className="text-3xl">👥</div>
            <p className="text-sm font-medium text-stone-600">
              Esta turma ainda não foi dividida em subturmas
            </p>
            <p className="max-w-sm text-xs text-stone-400">
              Use "+ Dividir Turma" para criar grupos (ex: Subturma A/B, Laboratório 1/2) e
              distribuir os alunos entre eles.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SubturmaColumn
              title="Sem subturma"
              tone="stone"
              students={semSubturma}
              subturmas={subturmas}
              onAssign={assignSubturma}
            />
            {subturmas.map((sub) => (
              <SubturmaColumn
                key={sub.id}
                title={sub.nome}
                tone="emerald"
                students={students.filter((s) => s.subturmaId === sub.id)}
                subturmas={subturmas}
                onAssign={assignSubturma}
              />
            ))}
          </div>
        )}
      </div>

      {showDivideModal && (
        <DivideClassModal
          classId={classId}
          existingCount={subturmas.length}
          onClose={() => setShowDivideModal(false)}
          onCreated={() => {
            setShowDivideModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Coluna de subturma (lista de alunos + seletor de destino)
// ============================================================

function SubturmaColumn({
  title,
  tone,
  students,
  subturmas,
  onAssign,
}: {
  title: string;
  tone: 'stone' | 'emerald';
  students: StudentEnrollment[];
  subturmas: SubturmaRow[];
  onAssign: (enrollmentId: string, subturmaId: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
        <span
          className={[
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500',
          ].join(' ')}
        >
          {students.length}
        </span>
      </div>

      {students.length === 0 ? (
        <p className="py-6 text-center text-xs text-stone-400">Nenhum aluno aqui</p>
      ) : (
        <div className="flex flex-col divide-y divide-stone-100">
          {students.map((s) => (
            <div key={s.enrollmentId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-700">{s.nome}</p>
                <p className="text-[11px] text-stone-400">{s.matricula}</p>
              </div>
              <select
                value={s.subturmaId ?? ''}
                onChange={(e) => onAssign(s.enrollmentId, e.target.value || null)}
                className="shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Sem subturma</option>
                {subturmas.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.nome}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Modal: dividir turma em N subturmas
// ============================================================

type DivideMode = 'quantidade' | 'nomes';

function DivideClassModal({
  classId,
  existingCount,
  onClose,
  onCreated,
}: {
  classId: string;
  existingCount: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<DivideMode>('quantidade');
  const [quantidade, setQuantidade] = useState(2);
  const [nomesTexto, setNomesTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nomesFromQuantidade = Array.from({ length: quantidade }, (_, i) =>
    String.fromCharCode(65 + i)
  ).map((letra) => `Subturma ${letra}`);

  const nomesFromTexto = nomesTexto
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const nomesFinal = mode === 'quantidade' ? nomesFromQuantidade : nomesFromTexto;

  const handleCreate = async () => {
    if (nomesFinal.length === 0) {
      setError('Informe ao menos um nome de subturma.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase
        .from('subturmas')
        .insert(nomesFinal.map((nome) => ({ class_id: classId, nome })));
      if (insertErr) throw insertErr;
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao criar subturmas. Verifique se os nomes não se repetem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-stone-900">Dividir turma</h2>
        {existingCount > 0 && (
          <p className="mb-3 text-xs text-stone-400">
            Esta turma já tem {existingCount} subturma(s). As novas serão adicionadas às existentes.
          </p>
        )}

        <div className="mb-4 flex gap-1.5 rounded-xl bg-stone-100 p-1">
          <button
            onClick={() => setMode('quantidade')}
            className={[
              'flex-1 rounded-lg py-1.5 text-xs font-medium',
              mode === 'quantidade' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500',
            ].join(' ')}
          >
            Por quantidade
          </button>
          <button
            onClick={() => setMode('nomes')}
            className={[
              'flex-1 rounded-lg py-1.5 text-xs font-medium',
              mode === 'nomes' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500',
            ].join(' ')}
          >
            Nomes personalizados
          </button>
        </div>

        {mode === 'quantidade' ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-stone-500">Quantidade de subturmas</label>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setQuantidade(n)}
                  className={[
                    'flex-1 rounded-lg border py-2 text-sm font-medium',
                    quantidade === n
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-stone-200 bg-white text-stone-600',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-stone-400">
              Serão criadas: {nomesFromQuantidade.join(', ')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-stone-500">
              Um nome por linha (ex: Laboratório 1)
            </label>
            <textarea
              className="input h-28 resize-none"
              value={nomesTexto}
              onChange={(e) => setNomesTexto(e.target.value)}
              placeholder={'Laboratório 1\nLaboratório 2'}
            />
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-sm font-medium text-white active:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? 'Criando…' : 'Criar subturmas'}
          </button>
        </div>
      </div>
    </div>
  );
}
