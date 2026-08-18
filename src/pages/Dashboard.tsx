import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSyncManager } from '../utils/useSyncManager';
import SyncStatusBadge from '../components/SyncStatusBadge';
import { db } from '../utils/localDb';
import type { ClassRow } from '../types/database';

interface ClassWithStats extends ClassRow {
  totalAlunos: number;
  notasPreenchidas: number;
  notasTotais: number;
}

interface DashboardProps {
  onOpenWizard: () => void;
  onOpenGrades: (classId: string) => void;
  onOpenStudents: (classId: string) => void;
}

export default function Dashboard({ onOpenWizard, onOpenGrades, onOpenStudents }: DashboardProps) {
  const [classes, setClasses] = useState<ClassWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status: syncStatus, pendingCount } = useSyncManager();

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: classRows, error: classErr } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false });

      if (classErr) throw classErr;

      // Mantém o cache local de turmas atualizado, para a listagem básica
      // (nomes, badges) funcionar mesmo sem conexão.
      if (classRows) await db.local_classes.bulkPut(classRows);

      if (!classRows || classRows.length === 0) {
        setClasses([]);
        return;
      }

      const classIds = classRows.map((c) => c.id);

      // Total de alunos matriculados por turma
      const { data: enrollments, error: enrollErr } = await supabase
        .from('class_enrollments')
        .select('id, class_id')
        .in('class_id', classIds);
      if (enrollErr) throw enrollErr;

      const enrollmentIds = (enrollments ?? []).map((e) => e.id);
      const enrollmentsByClass = new Map<string, string[]>();
      for (const e of enrollments ?? []) {
        const list = enrollmentsByClass.get(e.class_id) ?? [];
        list.push(e.id);
        enrollmentsByClass.set(e.class_id, list);
      }

      // Progresso de lançamento: considera preenchida a etapa com nota_prova lançada
      let gradesRows: { enrollment_id: string; nota_prova: number | null }[] = [];
      if (enrollmentIds.length > 0) {
        const { data: grades, error: gradesErr } = await supabase
          .from('grades')
          .select('enrollment_id, nota_prova')
          .in('enrollment_id', enrollmentIds);
        if (gradesErr) throw gradesErr;
        gradesRows = grades ?? [];
      }

      const gradesByEnrollment = new Map<string, { total: number; preenchidas: number }>();
      for (const g of gradesRows) {
        const stat = gradesByEnrollment.get(g.enrollment_id) ?? { total: 0, preenchidas: 0 };
        stat.total += 1;
        if (g.nota_prova !== null) stat.preenchidas += 1;
        gradesByEnrollment.set(g.enrollment_id, stat);
      }

      const enriched: ClassWithStats[] = classRows.map((c) => {
        const enrollIds = enrollmentsByClass.get(c.id) ?? [];
        let notasTotais = 0;
        let notasPreenchidas = 0;
        for (const eid of enrollIds) {
          const stat = gradesByEnrollment.get(eid);
          if (stat) {
            notasTotais += stat.total;
            notasPreenchidas += stat.preenchidas;
          }
        }
        return {
          ...c,
          totalAlunos: enrollIds.length,
          notasPreenchidas,
          notasTotais,
        };
      });

      setClasses(enriched);
    } catch (err: any) {
      // Falha de rede: tenta mostrar ao menos a lista básica de turmas
      // do cache local (sem estatísticas de progresso, que dependem de
      // consultas adicionais).
      try {
        const cached = await db.local_classes.toArray();
        if (cached.length > 0) {
          setClasses(
            cached.map((c) => ({ ...c, totalAlunos: 0, notasPreenchidas: 0, notasTotais: 0 }))
          );
          setError(null);
          return;
        }
      } catch (cacheErr) {
        console.error('Falha também ao ler cache local:', cacheErr);
      }
      setError(err?.message ?? 'Erro ao carregar turmas.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-stone-500">MINHAS TURMAS</h1>
            <p className="text-xs text-stone-400">{classes.length} turma(s) cadastrada(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <SyncStatusBadge status={syncStatus} pendingCount={pendingCount} />
            <button
              onClick={onOpenWizard}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white active:bg-emerald-800"
            >
              + Nova turma
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {loading && (
          <div className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-stone-500 shadow-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            Carregando turmas…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && classes.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <div className="text-3xl">🗂️</div>
            <p className="text-sm font-medium text-stone-600">Nenhuma turma cadastrada ainda</p>
            <button
              onClick={onOpenWizard}
              className="mt-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white active:bg-emerald-800"
            >
              Cadastrar primeira turma
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {classes.map((c) => (
            <ClassCard
              key={c.id}
              classData={c}
              onOpenGrades={() => onOpenGrades(c.id)}
              onOpenStudents={() => onOpenStudents(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClassCard({
  classData,
  onOpenGrades,
  onOpenStudents,
}: {
  classData: ClassWithStats;
  onOpenGrades: () => void;
  onOpenStudents: () => void;
}) {
  const progresso =
    classData.notasTotais > 0
      ? Math.round((classData.notasPreenchidas / classData.notasTotais) * 100)
      : null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-stone-900">
            {classData.nome_disciplina}
          </h2>
          <p className="truncate text-xs text-stone-400">{classData.codigo_turma}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-stone-400">
          {classData.totalAlunos} aluno{classData.totalAlunos !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge>{classData.modalidade}</Badge>
        <Badge>{classData.qtd_etapas} etapas</Badge>
        <Badge tone={classData.tem_laboratorio ? 'emerald' : 'stone'}>
          {classData.tem_laboratorio ? 'Com lab' : 'Sem lab'}
        </Badge>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-stone-400">
          <span>Lançamento de notas</span>
          <span>{progresso !== null ? `${progresso}%` : 'sem dados offline'}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{ width: `${progresso ?? 0}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onOpenGrades}
          className="flex-1 rounded-lg bg-emerald-700 py-2 text-xs font-medium text-white active:bg-emerald-800"
        >
          Lançar notas
        </button>
        <button
          onClick={onOpenStudents}
          className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 active:bg-stone-50"
        >
          Alunos / Subturmas
        </button>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = 'stone',
}: {
  children: React.ReactNode;
  tone?: 'stone' | 'emerald';
}) {
  const toneClass =
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
