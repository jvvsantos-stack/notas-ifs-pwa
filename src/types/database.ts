export type Modalidade = 'Subsequente' | 'Integrado';

export interface ClassRow {
  id: string;
  professor_id: string | null;
  nome_disciplina: string;
  codigo_diario: string;
  codigo_turma: string;
  curso: string;
  modalidade: Modalidade;
  ano_periodo: string;
  professores: string | null;
  qtd_etapas: number;
  tem_laboratorio: boolean;
  peso_prova: number;
  peso_lab: number;
  qtd_tr_por_etapa: number[];
  qtd_praticas_por_etapa: number[];
  archived: boolean;
  created_at: string;
}

export interface StudentRow {
  id: string;
  matricula: string;
  nome: string;
  created_at: string;
}

export interface ClassEnrollmentRow {
  id: string;
  class_id: string;
  student_id: string;
  subturma_pratica: string | null;
  /** Avaliação única, aplicada após o fechamento de todas as etapas. */
  nota_prova_final: number | null;
  created_at: string;
}

export interface GradeRow {
  id: string;
  enrollment_id: string;
  etapa: number;
  tr_notas: Record<string, number>;
  nota_prova: number | null;
  nota_prova_recp: number | null;
  notas_praticas_lab: Record<string, number>;
  nota_lab_recp: number | null;
}
