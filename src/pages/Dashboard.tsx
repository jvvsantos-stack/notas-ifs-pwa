import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSyncManager } from '../utils/useSyncManager';
import SyncStatusBadge from '../components/SyncStatusBadge';
import ClassCardMenu from '../components/ClassCardMenu';
import ClassCreatedModal from '../components/ClassCreatedModal';
import EditClassModal from '../components/EditClassModal';
import DeleteClassModal from '../components/DeleteClassModal';
import ProfileMenu from '../components/ProfileMenu';
import { db } from '../utils/localDb';
import type { ClassRow, ProfileRow } from '../types/database';

interface ClassWithStats extends ClassRow {
  totalAlunos: number;
  notasPreenchidas: number;
  notasTotais: number;
}

interface DashboardProps {
  onOpenWizard: () => void;
  onOpenGrades: (classId: string) => void;
  onOpenStudents: (classId: string) => void;
  justCreated: { id: string; nome_disciplina: string; codigo_turma: string } | null;
  onDismissJustCreated: () => void;
  profile: ProfileRow;
  onLogout: () => void;
}

type ArchiveFilter = 'ativas' | 'arquivadas';

export default function Dashboard({
  onOpenWizard,
  onOpenGrades,
  onOpenStudents,
  justCreated,
  onDismissJustCreated,
  profile,
  onLogout,
}: DashboardProps) {
  const [classes, setClasses] = useState<ClassWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status: syncStatus, pendingCount } = useSyncManager();
  const [filter, setFilter] = useState<ArchiveFilter>('ativas');
  const [editingClass, setEditingClass] = useState<ClassRow | null>(null);
  const [deletingClass, setDeletingClass] = useState<ClassRow | null>(null);

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

  const handleArchiveToggle = async (classData: ClassRow) => {
    try {
      const { error: updateErr } = await supabase
        .from('classes')
        .update({ archived: !classData.archived })
        .eq('id', classData.id);
      if (updateErr) throw updateErr;
      await loadClasses();
    } catch (err) {
      console.error('Erro ao arquivar/desarquivar turma:', err);
    }
  };

  const visibleClasses = classes.filter((c) =>
    filter === 'ativas' ? !c.archived : c.archived
  );

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 py-3 md:px-8">
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-stone-500 md:text-base">
              MINHAS TURMAS
            </h1>
            <p className="text-xs text-stone-400 md:text-sm">
              {visibleClasses.length} turma(s) {filter === 'ativas' ? 'ativa(s)' : 'arquivada(s)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncStatusBadge status={syncStatus} pendingCount={pendingCount} />
            <button
              onClick={onOpenWizard}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white active:bg-emerald-800 md:px-4 md:py-2.5 md:text-sm"
            >
              + Nova turma
            </button>
            <ProfileMenu profile={profile} onLogout={onLogout} />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1800px] px-4 pt-4 md:px-8">
        <div className="mb-4 flex gap-1.5">
          <FilterTab active={filter === 'ativas'} onClick={() => setFilter('ativas')}>
            Turmas Ativas
          </FilterTab>
          <FilterTab active={filter === 'arquivadas'} onClick={() => setFilter('arquivadas')}>
            Turmas Arquivadas
          </FilterTab>
        </div>

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

        {!loading && !error && visibleClasses.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <div className="text-3xl">{filter === 'ativas' ? '🗂️' : '📦'}</div>
            <p className="text-sm font-medium text-stone-600">
              {filter === 'ativas' ? 'Nenhuma turma cadastrada ainda' : 'Nenhuma turma arquivada'}
            </p>
            {filter === 'ativas' && (
              <button
                onClick={onOpenWizard}
                className="mt-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white active:bg-emerald-800"
              >
                Cadastrar primeira turma
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleClasses.map((c) => (
            <ClassCard
              key={c.id}
              classData={c}
              onOpenGrades={() => onOpenGrades(c.id)}
              onOpenStudents={() => onOpenStudents(c.id)}
              onEdit={() => setEditingClass(c)}
              onArchiveToggle={() => handleArchiveToggle(c)}
              onDelete={() => setDeletingClass(c)}
            />
          ))}
        </div>
      </div>

      {justCreated && (
        <ClassCreatedModal
          createdClass={justCreated}
          onClose={() => {
            onDismissJustCreated();
            loadClasses();
          }}
        />
      )}

      {editingClass && (
        <EditClassModal
          classData={editingClass}
          onClose={() => setEditingClass(null)}
          onSaved={loadClasses}
        />
      )}

      {deletingClass && (
        <DeleteClassModal
          classData={deletingClass}
          onClose={() => setDeletingClass(null)}
          onDeleted={loadClasses}
        />
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full px-3.5 py-1.5 text-xs font-medium transition md:text-sm',
        active ? 'bg-emerald-700 text-white' : 'border border-stone-200 bg-white text-stone-500',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ClassCard({
  classData,
  onOpenGrades,
  onOpenStudents,
  onEdit,
  onArchiveToggle,
  onDelete,
}: {
  classData: ClassWithStats;
  onOpenGrades: () => void;
  onOpenStudents: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const progresso =
    classData.notasTotais > 0
      ? Math.round((classData.notasPreenchidas / classData.notasTotais) * 100)
      : null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-stone-900 md:text-base">
            {classData.nome_disciplina}
          </h2>
          <p className="truncate text-xs text-stone-400 md:text-sm">{classData.codigo_turma}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs font-medium text-stone-400 md:text-sm">
            {classData.totalAlunos} aluno{classData.totalAlunos !== 1 ? 's' : ''}
          </span>
          <ClassCardMenu
            archived={classData.archived}
            onEdit={onEdit}
            onArchiveToggle={onArchiveToggle}
            onDelete={onDelete}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge>{classData.modalidade}</Badge>
        <Badge>{classData.qtd_etapas} etapas</Badge>
        <Badge tone={classData.tem_laboratorio ? 'emerald' : 'stone'}>
          {classData.tem_laboratorio ? 'Com lab' : 'Sem lab'}
        </Badge>
        {classData.archived && <Badge tone="amber">Arquivada</Badge>}
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
          className="flex-1 rounded-lg bg-emerald-700 py-2 text-xs font-medium text-white active:bg-emerald-800 md:py-2.5 md:text-sm"
        >
          Lançar notas
        </button>
        <button
          onClick={onOpenStudents}
          className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 active:bg-stone-50 md:py-2.5 md:text-sm"
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
  tone?: 'stone' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-stone-100 text-stone-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
