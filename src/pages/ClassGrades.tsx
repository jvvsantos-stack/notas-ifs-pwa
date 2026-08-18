import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { db } from '../utils/localDb';
import { useGradeAutosave, type CellSaveStatus } from '../utils/useGradeAutosave';
import { useSyncManager } from '../utils/useSyncManager';
import { useSpreadsheetNavigation } from '../utils/useSpreadsheetNavigation';
import SyncStatusBadge from '../components/SyncStatusBadge';
import ExportModal from '../components/ExportModal';
import ProfileMenu from '../components/ProfileMenu';
import { formatNota } from '../utils/formatNota';
import {
  calcularNotaEtapa,
  consolidarAluno,
  type SituacaoParcial,
  type SituacaoFinal,
} from '../utils/gradeCalculations';
import type { ClassRow, GradeRow, SubturmaRow, ProfileRow } from '../types/database';

interface StudentRowData {
  enrollmentId: string;
  studentId: string;
  nome: string;
  matricula: string;
  subturmaId: string | null;
  /** Avaliação única, aplicada após o fechamento de todas as etapas. */
  notaProvaFinal: number | null;
  gradesByEtapa: Map<number, GradeRow>;
}

interface ClassGradesProps {
  classId: string;
  onBack: () => void;
  profile: ProfileRow;
  onLogout: () => void;
}

type SubturmaFilter = 'Todas' | string; // 'Todas' ou o id de uma subturma

const QUICK_VALUES = [0, 5, 10];

export default function ClassGrades({ classId, onBack, profile, onLogout }: ClassGradesProps) {
  const [classData, setClassData] = useState<ClassRow | null>(null);
  const [students, setStudents] = useState<StudentRowData[]>([]);
  const [subturmas, setSubturmas] = useState<SubturmaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const [activeTab, setActiveTab] = useState<number | 'consolidado'>(1);
  const [activeSection, setActiveSection] = useState<'teoria' | 'lab'>('teoria');
  const [subturmaFilter, setSubturmaFilter] = useState<SubturmaFilter>('Todas');

  const { statusByKey, scheduleSave, scheduleEnrollmentSave } = useGradeAutosave();
  const { status: syncStatus, pendingCount, drainQueue } = useSyncManager();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Tenta a rede primeiro; se falhar (offline), cai para o cache local.
      let cls: ClassRow | null = null;
      let enrollments: any[] = [];
      let grades: GradeRow[] = [];

      try {
        const { data: clsData, error: clsErr } = await supabase
          .from('classes')
          .select('*')
          .eq('id', classId)
          .single();
        if (clsErr) throw clsErr;
        cls = clsData;

        const { data: enrollData, error: enrollErr } = await supabase
          .from('class_enrollments')
          .select('id, student_id, subturma_id, nota_prova_final, students(nome, matricula)')
          .eq('class_id', classId);
        if (enrollErr) throw enrollErr;
        enrollments = enrollData ?? [];

        const { data: subturmasData, error: subturmasErr } = await supabase
          .from('subturmas')
          .select('*')
          .eq('class_id', classId)
          .order('nome');
        if (subturmasErr) throw subturmasErr;
        setSubturmas(subturmasData ?? []);

        const enrollmentIds = enrollments.map((e) => e.id);
        if (enrollmentIds.length > 0) {
          const { data: gradesData, error: gradesErr } = await supabase
            .from('grades')
            .select('*')
            .in('enrollment_id', enrollmentIds);
          if (gradesErr) throw gradesErr;
          grades = gradesData ?? [];
        }

        // Atualiza o cache local com os dados frescos do servidor.
        if (cls) await db.local_classes.put(cls);
        await db.local_enrollments.bulkPut(
          enrollments.map((e) => ({
            id: e.id,
            class_id: classId,
            student_id: e.student_id,
            subturma_id: e.subturma_id,
            nota_prova_final: e.nota_prova_final,
            created_at: '',
          }))
        );
        await db.local_grades.bulkPut(
          grades.map((g) => ({ ...g, enrollment_etapa: `${g.enrollment_id}:${g.etapa}` }))
        );
      } catch (networkErr) {
        // Offline ou erro de rede: usa o que já está salvo localmente.
        console.warn('Falha ao buscar do Supabase, usando cache local:', networkErr);
        const localEnrollments = await db.local_enrollments
          .where('class_id')
          .equals(classId)
          .toArray();
        if (localEnrollments.length === 0) {
          throw new Error(
            'Sem conexão e nenhum dado local salvo desta turma ainda. Conecte-se à internet ao menos uma vez para carregar os dados antes de usar offline.'
          );
        }
        enrollments = localEnrollments.map((e) => ({ ...e, students: null }));
        const localGrades = await db.local_grades.toArray();
        grades = localGrades.filter((g) =>
          localEnrollments.some((e) => e.id === g.enrollment_id)
        );

        // A turma em si vem do cache local (ou do state já carregado, se existir).
        cls = (await db.local_classes.get(classId)) ?? classData;
      }

      if (cls) setClassData(cls);

      const gradesByEnrollment = new Map<string, Map<number, GradeRow>>();
      for (const g of grades) {
        const map = gradesByEnrollment.get(g.enrollment_id) ?? new Map();
        map.set(g.etapa, g);
        gradesByEnrollment.set(g.enrollment_id, map);
      }

      const rows: StudentRowData[] = enrollments.map((e: any) => ({
        enrollmentId: e.id,
        studentId: e.student_id,
        nome: e.students?.nome ?? '(sem nome)',
        matricula: e.students?.matricula ?? '',
        subturmaId: e.subturma_id,
        notaProvaFinal: e.nota_prova_final,
        gradesByEtapa: gradesByEnrollment.get(e.id) ?? new Map(),
      }));

      rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setStudents(rows);
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao carregar dados da turma.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [classId, classData]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Ctrl+S / Cmd+S força uma tentativa de sincronização imediata.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        drainQueue();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drainQueue]);

  // Atualização otimista local + agenda salvamento
  const updateGradeField = useCallback(
    (enrollmentId: string, etapa: number, field: keyof GradeRow, value: any, cellKey: string) => {
      setStudents((prev) =>
        prev.map((s) => {
          if (s.enrollmentId !== enrollmentId) return s;
          const grade = s.gradesByEtapa.get(etapa);
          if (!grade) return s;
          const updatedGrade = { ...grade, [field]: value };
          const newMap = new Map(s.gradesByEtapa);
          newMap.set(etapa, updatedGrade);
          return { ...s, gradesByEtapa: newMap };
        })
      );
      scheduleSave(cellKey, enrollmentId, etapa, { [field]: value } as Partial<GradeRow>);
    },
    [scheduleSave]
  );

  const updateJsonField = useCallback(
    (
      enrollmentId: string,
      etapa: number,
      field: 'tr_notas' | 'notas_praticas_lab',
      subKey: string,
      value: number | null,
      cellKey: string
    ) => {
      setStudents((prev) => {
        const studentIdx = prev.findIndex((s) => s.enrollmentId === enrollmentId);
        if (studentIdx === -1) return prev;

        const student = prev[studentIdx];
        const grade = student.gradesByEtapa.get(etapa);
        if (!grade) return prev;

        const newJson: Record<string, number> = { ...grade[field] };
        if (value === null) delete newJson[subKey];
        else newJson[subKey] = value;

        const updatedGrade = { ...grade, [field]: newJson };
        const newGradesMap = new Map(student.gradesByEtapa);
        newGradesMap.set(etapa, updatedGrade);

        const newStudents = [...prev];
        newStudents[studentIdx] = { ...student, gradesByEtapa: newGradesMap };

        scheduleSave(cellKey, enrollmentId, etapa, { [field]: newJson } as Partial<GradeRow>);

        return newStudents;
      });
    },
    [scheduleSave]
  );

  const updateProvaFinal = useCallback(
    (enrollmentId: string, value: number | null) => {
      setStudents((prev) =>
        prev.map((s) => (s.enrollmentId === enrollmentId ? { ...s, notaProvaFinal: value } : s))
      );
      scheduleEnrollmentSave(`${enrollmentId}-provafinal`, enrollmentId, {
        nota_prova_final: value,
      });
    },
    [scheduleEnrollmentSave]
  );

  const visibleStudents = useMemo(() => {
    if (subturmaFilter === 'Todas') return students;
    return students.filter((s) => s.subturmaId === subturmaFilter);
  }, [students, subturmaFilter]);

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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? 'Turma não encontrada.'}
        </div>
      </div>
    );
  }

  const etapas = Array.from({ length: classData.qtd_etapas }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-3 md:px-8">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-3">
              <button
                onClick={onBack}
                aria-label="Voltar"
                className="group -ml-1 flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-2xl font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-emerald-700 focus:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <span aria-hidden className="leading-none">←</span>
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-stone-900 md:text-base">
                  {classData.nome_disciplina}
                </h1>
                <p className="text-xs text-stone-400 md:text-sm">{classData.codigo_turma}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="flex flex-col items-end gap-1.5">
                <SyncStatusBadge status={syncStatus} pendingCount={pendingCount} />
                <button
                  onClick={() => setExportOpen(true)}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 active:bg-stone-50"
                >
                  Exportar
                </button>
              </div>
              <ProfileMenu profile={profile} onLogout={onLogout} />
            </div>
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {etapas.map((etapa) => (
              <TabButton key={etapa} active={activeTab === etapa} onClick={() => setActiveTab(etapa)}>
                Etapa {etapa}
              </TabButton>
            ))}
            <TabButton active={activeTab === 'consolidado'} onClick={() => setActiveTab('consolidado')}>
              Consolidado
            </TabButton>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1800px] px-4 pt-4 md:px-8">
        {activeTab !== 'consolidado' && (
          <>
            {classData.tem_laboratorio && (
              <div className="mb-3 flex gap-1.5">
                <TabButton small active={activeSection === 'teoria'} onClick={() => setActiveSection('teoria')}>
                  Teoria
                </TabButton>
                <TabButton small active={activeSection === 'lab'} onClick={() => setActiveSection('lab')}>
                  Práticas / Laboratório
                </TabButton>
              </div>
            )}

            {activeSection === 'teoria' || !classData.tem_laboratorio ? (
              <TheoryGrid
                classData={classData}
                etapa={activeTab}
                students={visibleStudents}
                statusByKey={statusByKey}
                updateGradeField={updateGradeField}
                updateJsonField={updateJsonField}
                isMobile={isMobile}
              />
            ) : (
              <LabGrid
                classData={classData}
                etapa={activeTab}
                students={students}
                subturmas={subturmas}
                subturmaFilter={subturmaFilter}
                setSubturmaFilter={setSubturmaFilter}
                statusByKey={statusByKey}
                updateGradeField={updateGradeField}
                updateJsonField={updateJsonField}
                isMobile={isMobile}
              />
            )}
          </>
        )}

        {activeTab === 'consolidado' && (
          <ConsolidatedView
            classData={classData}
            students={students}
            etapas={etapas}
            statusByKey={statusByKey}
            updateProvaFinal={updateProvaFinal}
          />
        )}
      </div>

      {exportOpen && (
        <ExportModal
          classData={classData}
          students={students}
          etapas={etapas}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Tabs
// ============================================================

function TabButton({
  active,
  onClick,
  children,
  small = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'shrink-0 rounded-full font-medium transition',
        small ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-xs',
        active ? 'bg-emerald-700 text-white' : 'bg-white text-stone-500 border border-stone-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ============================================================
// Indicador de status de salvamento por célula
// ============================================================

function SaveIndicator({ status }: { status: CellSaveStatus | undefined }) {
  if (!status || status === 'idle') return null;
  if (status === 'saving')
    return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" title="Salvando localmente…" />;
  if (status === 'saved')
    return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" title="Salvo localmente" />;
  return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500" title="Erro ao salvar" />;
}

// ============================================================
// Input numérico de célula (compartilhado, com navegação por teclado
// e atalhos de nota rápida no mobile)
// ============================================================

function GradeInput({
  value,
  onChange,
  status,
  row,
  col,
  maxCol,
  registerCell,
  handleKeyDown,
  isMobile,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  status: CellSaveStatus | undefined;
  row: number;
  col: number;
  maxCol: number;
  registerCell: (row: number, col: number, el: HTMLInputElement | null) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number, maxCol: number) => void;
  isMobile: boolean;
}) {
  const [localValue, setLocalValue] = useState(value?.toString() ?? '');
  const [showQuick, setShowQuick] = useState(false);

  useEffect(() => {
    setLocalValue(value?.toString() ?? '');
  }, [value]);

  const commit = (raw: string) => {
    const parsed = raw.trim() === '' ? null : Number(raw);
    onChange(Number.isNaN(parsed as number) ? null : parsed);
  };

  return (
    <div className="relative flex items-center">
      <input
        ref={(el) => registerCell(row, col, el)}
        type="number"
        step="0.1"
        min="0"
        max="10"
        inputMode="decimal"
        className="w-16 rounded-md border border-stone-200 px-1.5 py-1 text-center text-xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 md:w-20 md:px-2 md:py-1.5 md:text-base"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => isMobile && setShowQuick(true)}
        onBlur={() => {
          commit(localValue);
          // pequeno delay para permitir o clique nos botões de atalho antes de sumir
          setTimeout(() => setShowQuick(false), 150);
        }}
        onKeyDown={(e) => handleKeyDown(e, row, col, maxCol)}
      />
      <SaveIndicator status={status} />

      {isMobile && showQuick && (
        <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-md">
          {QUICK_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setLocalValue(String(v));
                commit(String(v));
              }}
              className="rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 active:bg-emerald-100"
            >
              {v.toFixed(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Grid de Teoria
// ============================================================

function TheoryGrid({
  classData,
  etapa,
  students,
  statusByKey,
  updateGradeField,
  updateJsonField,
  isMobile,
}: {
  classData: ClassRow;
  etapa: number;
  students: StudentRowData[];
  statusByKey: Record<string, CellSaveStatus>;
  updateGradeField: (enrollmentId: string, etapa: number, field: keyof GradeRow, value: any, cellKey: string) => void;
  updateJsonField: (
    enrollmentId: string,
    etapa: number,
    field: 'tr_notas' | 'notas_praticas_lab',
    subKey: string,
    value: number | null,
    cellKey: string
  ) => void;
  isMobile: boolean;
}) {
  const qtdTr = classData.qtd_tr_por_etapa[etapa - 1] ?? 0;
  const trKeys = Array.from({ length: qtdTr }, (_, i) => `TR${i + 1}`);
  const colCount = trKeys.length + 2; // + Prova + Prova Recp.

  const { registerCell, handleKeyDown } = useSpreadsheetNavigation();

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {students.map((s, row) => {
          const grade = s.gradesByEtapa.get(etapa);
          if (!grade) return null;
          const result = calcularNotaEtapa(
            {
              tr_notas: grade.tr_notas,
              nota_prova: grade.nota_prova,
              nota_prova_recp: grade.nota_prova_recp,
              notas_praticas_lab: grade.notas_praticas_lab,
              nota_lab_recp: grade.nota_lab_recp,
            },
            classData.tem_laboratorio,
            classData.peso_prova,
            classData.peso_lab
          );

          return (
            <div key={s.enrollmentId} className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-stone-800">{s.nome}</p>
              <div className="grid grid-cols-3 gap-2">
                {trKeys.map((k, col) => (
                  <FieldBlock label={k} key={k}>
                    <GradeInput
                      value={grade.tr_notas[k]}
                      status={statusByKey[`${s.enrollmentId}-${etapa}-${k}`]}
                      row={row}
                      col={col}
                      maxCol={colCount}
                      registerCell={registerCell}
                      handleKeyDown={handleKeyDown}
                      isMobile={isMobile}
                      onChange={(v) =>
                        updateJsonField(s.enrollmentId, etapa, 'tr_notas', k, v, `${s.enrollmentId}-${etapa}-${k}`)
                      }
                    />
                  </FieldBlock>
                ))}
                <FieldBlock label="Prova">
                  <GradeInput
                    value={grade.nota_prova}
                    status={statusByKey[`${s.enrollmentId}-${etapa}-prova`]}
                    row={row}
                    col={trKeys.length}
                    maxCol={colCount}
                    registerCell={registerCell}
                    handleKeyDown={handleKeyDown}
                    isMobile={isMobile}
                    onChange={(v) =>
                      updateGradeField(s.enrollmentId, etapa, 'nota_prova', v, `${s.enrollmentId}-${etapa}-prova`)
                    }
                  />
                </FieldBlock>
                <FieldBlock label="Prova Recp.">
                  <GradeInput
                    value={grade.nota_prova_recp}
                    status={statusByKey[`${s.enrollmentId}-${etapa}-provarecp`]}
                    row={row}
                    col={trKeys.length + 1}
                    maxCol={colCount}
                    registerCell={registerCell}
                    handleKeyDown={handleKeyDown}
                    isMobile={isMobile}
                    onChange={(v) =>
                      updateGradeField(
                        s.enrollmentId,
                        etapa,
                        'nota_prova_recp',
                        v,
                        `${s.enrollmentId}-${etapa}-provarecp`
                      )
                    }
                  />
                </FieldBlock>
              </div>
              <div className="mt-2 flex justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs">
                <span className="text-stone-400">
                  Prova Total: <strong className="text-stone-600">{formatNota(result.provaTotal)}</strong>
                </span>
                <span className="text-stone-400">
                  c/ Recp.: <strong className="text-emerald-700">{formatNota(result.provaComRecp)}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-xs md:text-sm">
        <thead>
          <tr className="border-b border-stone-100 bg-stone-50 text-stone-400">
            <th className="sticky left-0 z-10 bg-stone-50 px-3 py-2 text-left font-medium md:px-4 md:py-3 md:text-base">Aluno</th>
            {trKeys.map((k) => (
              <th key={k} className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">{k}</th>
            ))}
            <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Prova</th>
            <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Prova Recp.</th>
            <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Prova Total</th>
            <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Prova c/ Recp.</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, row) => {
            const grade = s.gradesByEtapa.get(etapa);
            if (!grade) return null;

            const result = calcularNotaEtapa(
              {
                tr_notas: grade.tr_notas,
                nota_prova: grade.nota_prova,
                nota_prova_recp: grade.nota_prova_recp,
                notas_praticas_lab: grade.notas_praticas_lab,
                nota_lab_recp: grade.nota_lab_recp,
              },
              classData.tem_laboratorio,
              classData.peso_prova,
              classData.peso_lab
            );

            return (
              <tr key={s.enrollmentId} className="border-b border-stone-50 last:border-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 md:px-4 md:py-3 font-medium text-stone-700 md:text-base">{s.nome}</td>
                {trKeys.map((k, col) => (
                  <td key={k} className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                    <GradeInput
                      value={grade.tr_notas[k]}
                      status={statusByKey[`${s.enrollmentId}-${etapa}-${k}`]}
                      row={row}
                      col={col}
                      maxCol={colCount}
                      registerCell={registerCell}
                      handleKeyDown={handleKeyDown}
                      isMobile={isMobile}
                      onChange={(v) =>
                        updateJsonField(s.enrollmentId, etapa, 'tr_notas', k, v, `${s.enrollmentId}-${etapa}-${k}`)
                      }
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                  <GradeInput
                    value={grade.nota_prova}
                    status={statusByKey[`${s.enrollmentId}-${etapa}-prova`]}
                    row={row}
                    col={trKeys.length}
                    maxCol={colCount}
                    registerCell={registerCell}
                    handleKeyDown={handleKeyDown}
                    isMobile={isMobile}
                    onChange={(v) =>
                      updateGradeField(s.enrollmentId, etapa, 'nota_prova', v, `${s.enrollmentId}-${etapa}-prova`)
                    }
                  />
                </td>
                <td className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                  <GradeInput
                    value={grade.nota_prova_recp}
                    status={statusByKey[`${s.enrollmentId}-${etapa}-provarecp`]}
                    row={row}
                    col={trKeys.length + 1}
                    maxCol={colCount}
                    registerCell={registerCell}
                    handleKeyDown={handleKeyDown}
                    isMobile={isMobile}
                    onChange={(v) =>
                      updateGradeField(
                        s.enrollmentId,
                        etapa,
                        'nota_prova_recp',
                        v,
                        `${s.enrollmentId}-${etapa}-provarecp`
                      )
                    }
                  />
                </td>
                <td className="px-2 py-1.5 md:px-4 md:py-3 text-center font-medium text-stone-600">{formatNota(result.provaTotal)}</td>
                <td className="px-2 py-1.5 md:px-4 md:py-3 text-center font-semibold text-emerald-700">{formatNota(result.provaComRecp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col items-center gap-1 text-[10px] font-medium text-stone-400">
      {label}
      {children}
    </label>
  );
}

// ============================================================
// Grid de Laboratório
// ============================================================

function LabGrid({
  classData,
  etapa,
  students,
  subturmas,
  subturmaFilter,
  setSubturmaFilter,
  statusByKey,
  updateGradeField,
  updateJsonField,
  isMobile,
}: {
  classData: ClassRow;
  etapa: number;
  students: StudentRowData[];
  subturmas: SubturmaRow[];
  subturmaFilter: SubturmaFilter;
  setSubturmaFilter: (f: SubturmaFilter) => void;
  statusByKey: Record<string, CellSaveStatus>;
  updateGradeField: (enrollmentId: string, etapa: number, field: keyof GradeRow, value: any, cellKey: string) => void;
  updateJsonField: (
    enrollmentId: string,
    etapa: number,
    field: 'tr_notas' | 'notas_praticas_lab',
    subKey: string,
    value: number | null,
    cellKey: string
  ) => void;
  isMobile: boolean;
}) {
  const qtdPraticas = classData.qtd_praticas_por_etapa[etapa - 1] ?? 0;
  const labKeys = Array.from({ length: qtdPraticas }, (_, i) => `LAB${i + 1}`);
  const colCount = labKeys.length + 1; // + Lab Recp.

  const { registerCell, handleKeyDown } = useSpreadsheetNavigation();

  const filtered =
    subturmaFilter === 'Todas' ? students : students.filter((s) => s.subturmaId === subturmaFilter);

  const filterBar = (
    <div className="mb-3 flex flex-wrap gap-1.5">
      <TabButton small active={subturmaFilter === 'Todas'} onClick={() => setSubturmaFilter('Todas')}>
        Todas
      </TabButton>
      {subturmas.map((sub) => (
        <TabButton small key={sub.id} active={subturmaFilter === sub.id} onClick={() => setSubturmaFilter(sub.id)}>
          {sub.nome}
        </TabButton>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {filterBar}
        {filtered.map((s, row) => {
          const grade = s.gradesByEtapa.get(etapa);
          if (!grade) return null;
          const result = calcularNotaEtapa(
            {
              tr_notas: grade.tr_notas,
              nota_prova: grade.nota_prova,
              nota_prova_recp: grade.nota_prova_recp,
              notas_praticas_lab: grade.notas_praticas_lab,
              nota_lab_recp: grade.nota_lab_recp,
            },
            classData.tem_laboratorio,
            classData.peso_prova,
            classData.peso_lab
          );

          return (
            <div key={s.enrollmentId} className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-stone-800">{s.nome}</p>
              <div className="grid grid-cols-3 gap-2">
                {labKeys.map((k, col) => (
                  <FieldBlock label={k} key={k}>
                    <GradeInput
                      value={grade.notas_praticas_lab[k]}
                      status={statusByKey[`${s.enrollmentId}-${etapa}-${k}`]}
                      row={row}
                      col={col}
                      maxCol={colCount}
                      registerCell={registerCell}
                      handleKeyDown={handleKeyDown}
                      isMobile={isMobile}
                      onChange={(v) =>
                        updateJsonField(
                          s.enrollmentId,
                          etapa,
                          'notas_praticas_lab',
                          k,
                          v,
                          `${s.enrollmentId}-${etapa}-${k}`
                        )
                      }
                    />
                  </FieldBlock>
                ))}
                <FieldBlock label="Lab Recp.">
                  <GradeInput
                    value={grade.nota_lab_recp}
                    status={statusByKey[`${s.enrollmentId}-${etapa}-labrecp`]}
                    row={row}
                    col={labKeys.length}
                    maxCol={colCount}
                    registerCell={registerCell}
                    handleKeyDown={handleKeyDown}
                    isMobile={isMobile}
                    onChange={(v) =>
                      updateGradeField(s.enrollmentId, etapa, 'nota_lab_recp', v, `${s.enrollmentId}-${etapa}-labrecp`)
                    }
                  />
                </FieldBlock>
              </div>
              <div className="mt-2 flex justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs">
                <span className="text-stone-400">
                  Média: <strong className="text-stone-600">{formatNota(result.mediaLab)}</strong>
                </span>
                <span className="text-stone-400">
                  c/ Recp.: <strong className="text-emerald-700">{formatNota(result.labComRecp)}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {filterBar}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-xs md:text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-stone-400">
              <th className="sticky left-0 z-10 bg-stone-50 px-3 py-2 text-left font-medium md:px-4 md:py-3 md:text-base">Aluno</th>
              {labKeys.map((k) => (
                <th key={k} className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">{k}</th>
              ))}
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Média Práticas</th>
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Lab Recp.</th>
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Lab c/ Recp.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, row) => {
              const grade = s.gradesByEtapa.get(etapa);
              if (!grade) return null;

              const result = calcularNotaEtapa(
                {
                  tr_notas: grade.tr_notas,
                  nota_prova: grade.nota_prova,
                  nota_prova_recp: grade.nota_prova_recp,
                  notas_praticas_lab: grade.notas_praticas_lab,
                  nota_lab_recp: grade.nota_lab_recp,
                },
                classData.tem_laboratorio,
                classData.peso_prova,
                classData.peso_lab
              );

              return (
                <tr key={s.enrollmentId} className="border-b border-stone-50 last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 md:px-4 md:py-3 font-medium text-stone-700 md:text-base">{s.nome}</td>
                  {labKeys.map((k, col) => (
                    <td key={k} className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                      <GradeInput
                        value={grade.notas_praticas_lab[k]}
                        status={statusByKey[`${s.enrollmentId}-${etapa}-${k}`]}
                        row={row}
                        col={col}
                        maxCol={colCount}
                        registerCell={registerCell}
                        handleKeyDown={handleKeyDown}
                        isMobile={isMobile}
                        onChange={(v) =>
                          updateJsonField(
                            s.enrollmentId,
                            etapa,
                            'notas_praticas_lab',
                            k,
                            v,
                            `${s.enrollmentId}-${etapa}-${k}`
                          )
                        }
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center font-medium text-stone-600">
                    {formatNota(result.mediaLab)}
                  </td>
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                    <GradeInput
                      value={grade.nota_lab_recp}
                      status={statusByKey[`${s.enrollmentId}-${etapa}-labrecp`]}
                      row={row}
                      col={labKeys.length}
                      maxCol={colCount}
                      registerCell={registerCell}
                      handleKeyDown={handleKeyDown}
                      isMobile={isMobile}
                      onChange={(v) =>
                        updateGradeField(
                          s.enrollmentId,
                          etapa,
                          'nota_lab_recp',
                          v,
                          `${s.enrollmentId}-${etapa}-labrecp`
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center font-semibold text-emerald-700">{formatNota(result.labComRecp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Consolidado / Resultado Final
// ============================================================

function ConsolidatedView({
  classData,
  students,
  etapas,
  statusByKey,
  updateProvaFinal,
}: {
  classData: ClassRow;
  students: StudentRowData[];
  etapas: number[];
  statusByKey: Record<string, CellSaveStatus>;
  updateProvaFinal: (enrollmentId: string, value: number | null) => void;
}) {
  const { registerCell, handleKeyDown } = useSpreadsheetNavigation();

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-stone-100 px-3 py-2 text-[11px] text-stone-500">
        A Prova Final é aplicada somente após o fechamento de todas as etapas, para quem não
        atingiu média parcial ≥ 6,0. Lance a nota diretamente na coluna abaixo.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-xs md:text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-stone-400">
              <th className="sticky left-0 z-10 bg-stone-50 px-3 py-2 text-left font-medium md:px-4 md:py-3 md:text-base">Aluno</th>
              {etapas.map((e) => (
                <th key={e} className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Etapa {e}</th>
              ))}
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Prova Final</th>
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Média Parcial</th>
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Situação Parcial</th>
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Média Final</th>
              <th className="px-2 py-2 md:px-4 md:py-3 font-medium md:text-base">Situação Final</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, row) => {
              const notasEtapas = etapas.map((etapa) => {
                const grade = s.gradesByEtapa.get(etapa);
                if (!grade) return null;
                const result = calcularNotaEtapa(
                  {
                    tr_notas: grade.tr_notas,
                    nota_prova: grade.nota_prova,
                    nota_prova_recp: grade.nota_prova_recp,
                    notas_praticas_lab: grade.notas_praticas_lab,
                    nota_lab_recp: grade.nota_lab_recp,
                  },
                  classData.tem_laboratorio,
                  classData.peso_prova,
                  classData.peso_lab
                );
                return result.notaEtapa;
              });

              const consolidacao = consolidarAluno({
                notasEtapas,
                notaProvaFinal: s.notaProvaFinal,
              });

              const podeLancarProvaFinal = consolidacao.situacaoParcial === 'RECUPERAÇÃO';

              return (
                <tr key={s.enrollmentId} className="border-b border-stone-50 last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 md:px-4 md:py-3 font-medium text-stone-700 md:text-base">{s.nome}</td>
                  {notasEtapas.map((n, i) => (
                    <td key={i} className="px-2 py-1.5 md:px-4 md:py-3 text-center text-stone-600">
                      {formatNota(n)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                    {podeLancarProvaFinal ? (
                      <GradeInput
                        value={s.notaProvaFinal}
                        status={statusByKey[`${s.enrollmentId}-provafinal`]}
                        row={row}
                        col={0}
                        maxCol={1}
                        registerCell={registerCell}
                        handleKeyDown={handleKeyDown}
                        isMobile={false}
                        onChange={(v) => updateProvaFinal(s.enrollmentId, v)}
                      />
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center font-medium text-stone-700">
                    {formatNota(consolidacao.mediaParcial)}
                  </td>
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                    <SituacaoBadge situacao={consolidacao.situacaoParcial} />
                  </td>
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center font-medium text-stone-700">
                    {formatNota(consolidacao.mediaFinal)}
                  </td>
                  <td className="px-2 py-1.5 md:px-4 md:py-3 text-center">
                    <SituacaoBadge situacao={consolidacao.situacaoFinal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SituacaoBadge({ situacao }: { situacao: SituacaoParcial | SituacaoFinal }) {
  // Paleta pedida: Cursando = verde, Aprovado = azul, Reprovado/Recuperação = vermelho.
  const toneMap: Record<string, string> = {
    CURSANDO: 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm shadow-emerald-100',
    APROVADO: 'bg-blue-50 text-blue-700 border border-blue-300 shadow-sm shadow-blue-100',
    'RECUPERAÇÃO': 'bg-red-50 text-red-700 border border-red-300 shadow-sm shadow-red-100',
    REPROVADO: 'bg-red-50 text-red-700 border border-red-300 shadow-sm shadow-red-100',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneMap[situacao]}`}>{situacao}</span>
  );
}
