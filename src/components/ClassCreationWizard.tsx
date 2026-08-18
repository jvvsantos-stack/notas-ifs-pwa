import React, { useState, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
import { parseIfsClassPdf, type ParsedClassData, type ParsedStudent } from '../utils/pdfParser';
import type { Modalidade } from '../types/database';

type WizardStep = 1 | 2 | 3;

interface EditableStudent extends ParsedStudent {
  subturma: '' | 'Turma 1' | 'Turma 2';
  removido: boolean;
}

interface ClassFormState {
  nomeDisciplina: string;
  codigoDiario: string;
  codigoTurma: string;
  curso: string;
  modalidade: Modalidade;
  anoPeriodo: string;
  professores: string;
  qtdEtapas: number;
  temLaboratorio: boolean;
  pesoProva: number;
  pesoLab: number;
  qtdTrPorEtapa: number[];
  qtdPraticasPorEtapa: number[];
}

const defaultEtapasFor = (modalidade: Modalidade) => (modalidade === 'Subsequente' ? 2 : 4);

function buildInitialForm(parsed: ParsedClassData): ClassFormState {
  const modalidade: Modalidade = parsed.modalidade ?? 'Subsequente';
  const qtdEtapas = defaultEtapasFor(modalidade);
  return {
    nomeDisciplina: parsed.nomeDisciplina,
    codigoDiario: parsed.codigoDiario,
    codigoTurma: parsed.codigoTurma,
    curso: parsed.curso,
    modalidade,
    anoPeriodo: parsed.anoPeriodo,
    professores: parsed.professores,
    qtdEtapas,
    temLaboratorio: false,
    pesoProva: 6.0,
    pesoLab: 4.0,
    qtdTrPorEtapa: Array(qtdEtapas).fill(3),
    qtdPraticasPorEtapa: Array(qtdEtapas).fill(3),
  };
}

export default function ClassCreationWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedClassData | null>(null);

  const [form, setForm] = useState<ClassFormState | null>(null);
  const [students, setStudents] = useState<EditableStudent[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ---------- Passo 1: Upload + Parse ----------

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setParseError('Selecione um arquivo PDF válido.');
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseIfsClassPdf(file);
      if (result.alunos.length === 0) {
        setParseError('Não foi possível localizar a lista de alunos no PDF. Verifique o arquivo.');
      }
      setParsed(result);
      setForm(buildInitialForm(result));
      setStudents(
        result.alunos.map((a) => ({ ...a, subturma: '', removido: false }))
      );
    } catch (err) {
      setParseError('Falha ao processar o PDF. Verifique se é um diário do IFS válido.');
      console.error(err);
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ---------- Passo 2: Formulário ----------

  const updateForm = <K extends keyof ClassFormState>(key: K, value: ClassFormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleModalidadeChange = (modalidade: Modalidade) => {
    if (!form) return;
    const qtdEtapas = defaultEtapasFor(modalidade);
    setForm({
      ...form,
      modalidade,
      qtdEtapas,
      qtdTrPorEtapa: Array(qtdEtapas).fill(3),
      qtdPraticasPorEtapa: Array(qtdEtapas).fill(3),
    });
  };

  const updateTrEtapa = (index: number, value: number) => {
    if (!form) return;
    const next = [...form.qtdTrPorEtapa];
    next[index] = value;
    updateForm('qtdTrPorEtapa', next);
  };

  const updatePraticaEtapa = (index: number, value: number) => {
    if (!form) return;
    const next = [...form.qtdPraticasPorEtapa];
    next[index] = value;
    updateForm('qtdPraticasPorEtapa', next);
  };

  const updateStudent = (matricula: string, patch: Partial<EditableStudent>) => {
    setStudents((prev) =>
      prev.map((s) => (s.matricula === matricula ? { ...s, ...patch } : s))
    );
  };

  const activeStudents = useMemo(() => students.filter((s) => !s.removido), [students]);

  // ---------- Passo 3: Salvar ----------

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Insere a turma
      const { data: classRow, error: classErr } = await supabase
        .from('classes')
        .insert({
          professor_id: user?.id ?? null,
          nome_disciplina: form.nomeDisciplina,
          codigo_diario: form.codigoDiario,
          codigo_turma: form.codigoTurma,
          curso: form.curso,
          modalidade: form.modalidade,
          ano_periodo: form.anoPeriodo,
          professores: form.professores,
          qtd_etapas: form.qtdEtapas,
          tem_laboratorio: form.temLaboratorio,
          peso_prova: form.pesoProva,
          peso_lab: form.pesoLab,
          qtd_tr_por_etapa: form.qtdTrPorEtapa,
          qtd_praticas_por_etapa: form.qtdPraticasPorEtapa,
        })
        .select()
        .single();

      if (classErr) throw classErr;

      // 2. Upsert de alunos (por matrícula, para reaproveitar cadastros existentes)
      const { data: upsertedStudents, error: studentsErr } = await supabase
        .from('students')
        .upsert(
          activeStudents.map((s) => ({ matricula: s.matricula, nome: s.nome })),
          { onConflict: 'matricula' }
        )
        .select();

      if (studentsErr) throw studentsErr;

      const studentIdByMatricula = new Map(
        (upsertedStudents ?? []).map((s) => [s.matricula, s.id as string])
      );

      // 3. Cria matrículas na turma (class_enrollments)
      const enrollmentsPayload = activeStudents.map((s) => ({
        class_id: classRow.id,
        student_id: studentIdByMatricula.get(s.matricula),
        subturma_pratica: form.temLaboratorio && s.subturma ? s.subturma : null,
      }));

      const { data: enrollments, error: enrollErr } = await supabase
        .from('class_enrollments')
        .insert(enrollmentsPayload)
        .select();

      if (enrollErr) throw enrollErr;

      // 4. Inicializa registros de notas (grades) — uma linha por aluno por etapa
      const gradesPayload = (enrollments ?? []).flatMap((enrollment) =>
        Array.from({ length: form.qtdEtapas }, (_, i) => ({
          enrollment_id: enrollment.id,
          etapa: i + 1,
          tr_notas: {},
          notas_praticas_lab: {},
        }))
      );

      const { error: gradesErr } = await supabase.from('grades').insert(gradesPayload);
      if (gradesErr) throw gradesErr;

      setSaveSuccess(true);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Erro ao salvar a turma. Tente novamente.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <WizardHeader step={step} />

      <div className="mx-auto max-w-xl px-4 pt-4">
        {step === 1 && (
          <StepUpload
            parsing={parsing}
            parseError={parseError}
            parsed={parsed}
            onDrop={onDrop}
            onFileInput={onFileInput}
            onContinue={() => setStep(2)}
          />
        )}

        {step === 2 && form && (
          <StepForm
            form={form}
            students={students}
            activeCount={activeStudents.length}
            updateForm={updateForm}
            handleModalidadeChange={handleModalidadeChange}
            updateTrEtapa={updateTrEtapa}
            updatePraticaEtapa={updatePraticaEtapa}
            updateStudent={updateStudent}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && form && (
          <StepConfirm
            form={form}
            studentCount={activeStudents.length}
            saving={saving}
            saveError={saveError}
            saveSuccess={saveSuccess}
            onBack={() => setStep(2)}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Header com progresso
// ============================================================

function WizardHeader({ step }: { step: WizardStep }) {
  const labels = ['Upload', 'Configurar', 'Salvar'];
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto max-w-xl px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide text-stone-500">NOVA TURMA</h1>
        <div className="mt-2 flex items-center gap-2">
          {labels.map((label, i) => {
            const idx = (i + 1) as WizardStep;
            const isActive = idx === step;
            const isDone = idx < step;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <div
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                    isActive
                      ? 'bg-emerald-700 text-white'
                      : isDone
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-stone-200 text-stone-500',
                  ].join(' ')}
                >
                  {idx}
                </div>
                <span
                  className={[
                    'text-xs',
                    isActive ? 'font-medium text-stone-900' : 'text-stone-500',
                  ].join(' ')}
                >
                  {label}
                </span>
                {i < labels.length - 1 && <div className="h-px flex-1 bg-stone-200" />}
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ============================================================
// Passo 1: Upload
// ============================================================

function StepUpload({
  parsing,
  parseError,
  parsed,
  onDrop,
  onFileInput,
  onContinue,
}: {
  parsing: boolean;
  parseError: string | null;
  parsed: ParsedClassData | null;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white px-6 py-10 text-center transition hover:border-emerald-500 hover:bg-emerald-50/40"
      >
        <input type="file" accept="application/pdf" className="hidden" onChange={onFileInput} />
        <div className="text-3xl">📄</div>
        <p className="text-sm font-medium text-stone-700">
          Toque para selecionar ou arraste o PDF do diário
        </p>
        <p className="text-xs text-stone-400">Relação de Alunos — Sistema Acadêmico IFS</p>
      </label>

      {parsing && (
        <div className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-stone-500 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          Lendo o PDF…
        </div>
      )}

      {parseError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {parseError}
        </div>
      )}

      {parsed && !parsing && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Pré-visualização
          </h2>
          <dl className="grid grid-cols-1 gap-y-2 text-sm">
            <PreviewRow label="Disciplina" value={parsed.nomeDisciplina} />
            <PreviewRow label="Curso" value={parsed.curso} />
            <PreviewRow label="Diário" value={parsed.codigoDiario} />
            <PreviewRow label="Modalidade" value={parsed.modalidade ?? '—'} />
            <PreviewRow label="Turma" value={parsed.codigoTurma} />
            <PreviewRow label="Ano/Período" value={parsed.anoPeriodo} />
            <PreviewRow label="Professores" value={parsed.professores} />
            <PreviewRow label="Alunos encontrados" value={String(parsed.alunos.length)} />
          </dl>

          {parsed.camposComFalha.length > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Não foi possível extrair automaticamente: {parsed.camposComFalha.join(', ')}.
              Você poderá corrigir manualmente no próximo passo.
            </p>
          )}

          <button
            onClick={onContinue}
            className="mt-4 w-full rounded-xl bg-emerald-700 py-3 text-sm font-medium text-white active:bg-emerald-800"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-stone-100 py-1.5 last:border-0">
      <dt className="shrink-0 text-stone-400">{label}</dt>
      <dd className="text-right font-medium text-stone-800">{value || '—'}</dd>
    </div>
  );
}

// ============================================================
// Passo 2: Formulário de confirmação e regras
// ============================================================

function StepForm({
  form,
  students,
  activeCount,
  updateForm,
  handleModalidadeChange,
  updateTrEtapa,
  updatePraticaEtapa,
  updateStudent,
  onBack,
  onContinue,
}: {
  form: ClassFormState;
  students: EditableStudent[];
  activeCount: number;
  updateForm: <K extends keyof ClassFormState>(key: K, value: ClassFormState[K]) => void;
  handleModalidadeChange: (modalidade: Modalidade) => void;
  updateTrEtapa: (index: number, value: number) => void;
  updatePraticaEtapa: (index: number, value: number) => void;
  updateStudent: (matricula: string, patch: Partial<EditableStudent>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Dados da turma">
        <Field label="Disciplina">
          <input
            className="input"
            value={form.nomeDisciplina}
            onChange={(e) => updateForm('nomeDisciplina', e.target.value)}
          />
        </Field>
        <Field label="Modalidade">
          <div className="flex gap-2">
            {(['Subsequente', 'Integrado'] as Modalidade[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModalidadeChange(m)}
                className={[
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-medium',
                  form.modalidade === m
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-stone-200 bg-white text-stone-600',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <p className="text-xs text-stone-400">
          {form.qtdEtapas} etapas definidas automaticamente para {form.modalidade}.
        </p>
      </Section>

      <Section title="Trabalhos (TR) por etapa">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {form.qtdTrPorEtapa.map((qtd, i) => (
            <Field key={i} label={`Etapa ${i + 1}`}>
              <input
                type="number"
                min={0}
                className="input"
                value={qtd}
                onChange={(e) => updateTrEtapa(i, Number(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Laboratório">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={form.temLaboratorio}
            onChange={(e) => updateForm('temLaboratorio', e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
          />
          Possui atividades de laboratório?
        </label>

        {form.temLaboratorio && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {form.qtdPraticasPorEtapa.map((qtd, i) => (
                <Field key={i} label={`Práticas — Etapa ${i + 1}`}>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={qtd}
                    onChange={(e) => updatePraticaEtapa(i, Number(e.target.value))}
                  />
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso da Prova/Teoria">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.pesoProva}
                  onChange={(e) => updateForm('pesoProva', Number(e.target.value))}
                />
              </Field>
              <Field label="Peso do Laboratório">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.pesoLab}
                  onChange={(e) => updateForm('pesoLab', Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section title={`Alunos reconhecidos (${activeCount})`}>
        <div className="flex flex-col divide-y divide-stone-100">
          {students.map((s) => (
            <div key={s.matricula} className={s.removido ? 'py-2 opacity-40' : 'py-2'}>
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-xs text-stone-400">{s.numero}</span>
                <div className="flex-1">
                  <input
                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                    value={s.nome}
                    disabled={s.removido}
                    onChange={(e) => updateStudent(s.matricula, { nome: e.target.value })}
                  />
                  <p className="mt-0.5 text-xs text-stone-400">{s.matricula}</p>

                  {form.temLaboratorio && !s.removido && (
                    <div className="mt-1.5 flex gap-1.5">
                      {(['Turma 1', 'Turma 2'] as const).map((sub) => (
                        <button
                          key={sub}
                          onClick={() => updateStudent(s.matricula, { subturma: sub })}
                          className={[
                            'rounded-full px-2.5 py-1 text-xs font-medium',
                            s.subturma === sub
                              ? 'bg-emerald-700 text-white'
                              : 'bg-stone-100 text-stone-500',
                          ].join(' ')}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => updateStudent(s.matricula, { removido: !s.removido })}
                  className="mt-1 shrink-0 text-xs text-red-500"
                >
                  {s.removido ? 'Restaurar' : 'Remover'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-stone-600"
        >
          Voltar
        </button>
        <button
          onClick={onContinue}
          className="flex-1 rounded-xl bg-emerald-700 py-3 text-sm font-medium text-white active:bg-emerald-800"
        >
          Revisar e salvar
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
      {label}
      {children}
    </label>
  );
}

// ============================================================
// Passo 3: Confirmação e salvar
// ============================================================

function StepConfirm({
  form,
  studentCount,
  saving,
  saveError,
  saveSuccess,
  onBack,
  onSave,
}: {
  form: ClassFormState;
  studentCount: number;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  if (saveSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-3xl">✅</div>
        <h2 className="text-sm font-semibold text-emerald-800">Turma cadastrada com sucesso</h2>
        <p className="text-xs text-emerald-700">
          {form.nomeDisciplina} — {studentCount} alunos vinculados.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Resumo
        </h2>
        <dl className="grid gap-y-2 text-sm">
          <PreviewRow label="Disciplina" value={form.nomeDisciplina} />
          <PreviewRow label="Turma" value={form.codigoTurma} />
          <PreviewRow label="Modalidade" value={`${form.modalidade} (${form.qtdEtapas} etapas)`} />
          <PreviewRow label="TRs por etapa" value={form.qtdTrPorEtapa.join(' / ')} />
          <PreviewRow
            label="Laboratório"
            value={form.temLaboratorio ? `Sim (peso ${form.pesoProva}/${form.pesoLab})` : 'Não'}
          />
          <PreviewRow label="Alunos" value={String(studentCount)} />
        </dl>
      </section>

      {saveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex-1 rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-stone-600 disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-emerald-700 py-3 text-sm font-medium text-white active:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Cadastrar turma'}
        </button>
      </div>
    </div>
  );
}
