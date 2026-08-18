import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calcularNotaEtapa, consolidarAluno } from '../utils/gradeCalculations';
import type { ClassRow, GradeRow } from '../types/database';

interface StudentRowData {
  enrollmentId: string;
  studentId: string;
  nome: string;
  matricula: string;
  subturmaPratica: string | null;
  notaProvaFinal: number | null;
  gradesByEtapa: Map<number, GradeRow>;
}

interface ExportModalProps {
  classData: ClassRow;
  students: StudentRowData[];
  etapas: number[];
  onClose: () => void;
}

interface ConsolidatedStudentData {
  student: StudentRowData;
  notasEtapas: (number | null)[];
  mediaParcial: number | null;
  situacaoParcial: string;
  mediaFinal: number | null;
  situacaoFinal: string;
}

function buildConsolidatedData(
  classData: ClassRow,
  students: StudentRowData[],
  etapas: number[]
): ConsolidatedStudentData[] {
  return students.map((s) => {
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

    const consolidacao = consolidarAluno({ notasEtapas, notaProvaFinal: s.notaProvaFinal });

    return {
      student: s,
      notasEtapas,
      mediaParcial: consolidacao.mediaParcial,
      situacaoParcial: consolidacao.situacaoParcial,
      mediaFinal: consolidacao.mediaFinal,
      situacaoFinal: consolidacao.situacaoFinal,
    };
  });
}

function fmt(n: number | null): string {
  return n !== null ? n.toFixed(2) : '';
}

// ============================================================
// CSV
// ============================================================

function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCsv(classData: ClassRow, students: StudentRowData[], etapas: number[]) {
  const data = buildConsolidatedData(classData, students, etapas);

  const headers = [
    'Matrícula',
    'Nome',
    ...etapas.map((e) => `Etapa ${e}`),
    'Prova Final',
    'Média Parcial',
    'Situação Parcial',
    'Média Final',
    'Situação Final',
  ];

  const rows = data.map((d) => [
    d.student.matricula,
    d.student.nome,
    ...d.notasEtapas.map((n) => fmt(n)),
    fmt(d.student.notaProvaFinal),
    fmt(d.mediaParcial),
    d.situacaoParcial,
    fmt(d.mediaFinal),
    d.situacaoFinal,
  ]);

  // Separador ; e BOM UTF-8 — compatibilidade com Excel/SIGAA em locale pt-BR
  const csvContent =
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(';')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `notas_${classData.codigo_turma}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// PDF (Boletim da turma)
// ============================================================

function exportPdf(classData: ClassRow, students: StudentRowData[], etapas: number[]) {
  const data = buildConsolidatedData(classData, students, etapas);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Cabeçalho institucional
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('INSTITUTO FEDERAL DE SERGIPE', margin, 40);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Boletim Consolidado de Turma', margin, 56);

  doc.setFontSize(9);
  const infoLines = [
    `Disciplina: ${classData.nome_disciplina}`,
    `Curso: ${classData.curso}`,
    `Turma: ${classData.codigo_turma}    Diário: ${classData.codigo_diario}    Modalidade: ${classData.modalidade}`,
    `Professor(es): ${classData.professores ?? '-'}`,
    `Ano/Período: ${classData.ano_periodo}`,
  ];
  infoLines.forEach((line, i) => {
    doc.text(line, margin, 76 + i * 14);
  });

  const tableStartY = 76 + infoLines.length * 14 + 12;

  const head = [
    ['Matrícula', 'Nome', ...etapas.map((e) => `Etapa ${e}`), 'Prova Final', 'Média Parcial', 'Sit. Parcial', 'Média Final', 'Sit. Final'],
  ];

  const body = data.map((d) => [
    d.student.matricula,
    d.student.nome,
    ...d.notasEtapas.map((n) => fmt(n) || '—'),
    fmt(d.student.notaProvaFinal) || '—',
    fmt(d.mediaParcial) || '—',
    d.situacaoParcial,
    fmt(d.mediaFinal) || '—',
    d.situacaoFinal,
  ]);

  autoTable(doc, {
    head,
    body,
    startY: tableStartY,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { cellWidth: 140, halign: 'left' },
    },
    didParseCell: (hookData) => {
      // Colore a coluna de situação final conforme o valor
      const isLastCol = hookData.column.index === head[0].length - 1;
      const isSecondToLastCol = hookData.column.index === head[0].length - 3;
      if ((isLastCol || isSecondToLastCol) && hookData.section === 'body') {
        const value = Array.isArray(hookData.cell.text) ? hookData.cell.text.join('') : String(hookData.cell.text);
        if (value === 'APROVADO') hookData.cell.styles.textColor = [5, 150, 105];
        else if (value === 'REPROVADO') hookData.cell.styles.textColor = [220, 38, 38];
        else if (value === 'RECUPERAÇÃO') hookData.cell.styles.textColor = [217, 119, 6];
      }
    },
  });

  // Campo de assinatura, no rodapé da última página
  const finalY = (doc as any).lastAutoTable.finalY ?? tableStartY + 100;
  const signatureY = Math.min(finalY + 60, doc.internal.pageSize.getHeight() - 40);

  doc.setDrawColor(150);
  doc.line(margin, signatureY, margin + 220, signatureY);
  doc.setFontSize(9);
  doc.text(classData.professores ?? 'Professor(a)', margin, signatureY + 14);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Assinatura do Professor', margin, signatureY + 26);

  doc.setTextColor(120);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - margin - 120, signatureY + 26);

  doc.save(`boletim_${classData.codigo_turma}.pdf`);
}

// ============================================================
// Modal
// ============================================================

export default function ExportModal({ classData, students, etapas, onClose }: ExportModalProps) {
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const handleExport = async (type: 'csv' | 'pdf') => {
    setExporting(type);
    try {
      if (type === 'csv') exportCsv(classData, students, etapas);
      else exportPdf(classData, students, etapas);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800">Exportar turma</h2>
          <button onClick={onClose} className="text-xs text-stone-400">
            Fechar
          </button>
        </div>

        <p className="mb-4 text-xs text-stone-400">
          {classData.nome_disciplina} — {students.length} aluno(s)
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 text-left text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-60"
          >
            <span>Planilha (CSV)</span>
            <span className="text-xs text-stone-400">{exporting === 'csv' ? 'Gerando…' : 'compatível com SIGAA/Excel'}</span>
          </button>

          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 text-left text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-60"
          >
            <span>Boletim (PDF)</span>
            <span className="text-xs text-stone-400">{exporting === 'pdf' ? 'Gerando…' : 'para impressão/assinatura'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
