import type { GradeRow } from './database';

/**
 * View-model de um aluno matriculado numa turma, já achatado com os dados
 * de `students` (nome/matrícula) e de `class_enrollments` (subturma, prova
 * final) para uso direto na UI — usado tanto na grade de lançamento de
 * notas (`ClassGrades`) quanto na exportação (`ExportModal`).
 *
 * Centralizado aqui para evitar duplicação de definição entre arquivos,
 * que já causou incompatibilidade de tipos no passado (TS2719) quando as
 * duas cópias divergiam depois de uma mudança de schema.
 */
export interface StudentRowData {
  enrollmentId: string;
  studentId: string;
  nome: string;
  matricula: string;
  /**
   * Opcional: alunos ainda sem subturma atribuída não têm essa chave
   * definida, ou ela vem como `null`. Trate as duas formas como "sem
   * subturma" (ex: `s.subturmaId ?? null`).
   */
  subturmaId?: string | null;
  /** Avaliação única, aplicada após o fechamento de todas as etapas. */
  notaProvaFinal: number | null;
  gradesByEtapa: Map<number, GradeRow>;
}
