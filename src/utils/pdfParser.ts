import * as pdfjsLib from 'pdfjs-dist';

// Worker via CDN (evita bundling do worker no Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/** Formato mínimo de item de texto retornado por page.getTextContent(). */
interface TextItemLike {
  str: string;
  transform: number[];
}

export interface ParsedStudent {
  numero: number;
  matricula: string;
  nome: string;
}

export type ParsedModalidade = 'Subsequente' | 'Integrado';

export interface ParsedClassData {
  curso: string;
  codigoDiario: string;
  modalidade: ParsedModalidade | null;
  nomeDisciplina: string;
  professores: string;
  codigoTurma: string;
  anoPeriodo: string;
  alunos: ParsedStudent[];
  /** Trechos que falharam na extração — usado para alertar o usuário na UI */
  camposComFalha: string[];
  /** Texto bruto reconstituído, útil para debug */
  rawText: string;
}

/**
 * Reconstrói o texto do PDF agrupando os itens por linha (coordenada Y),
 * já que pdfjs-dist retorna itens soltos por posição, sem quebras de linha
 * confiáveis. Itens na mesma linha são unidos por espaço; novas linhas
 * (Y diferente, com tolerância) geram '\n'.
 */
async function extractLinedText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = (content.items as TextItemLike[])
      .filter((it) => 'str' in it && it.str.trim().length > 0)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
      }))
      .sort((a, b) => (b.y === a.y ? a.x - b.x : b.y - a.y)); // topo->baixo, esquerda->direita

    const Y_TOLERANCE = 3;
    let currentLine: typeof items = [];
    let currentY: number | null = null;

    const flushLine = () => {
      if (currentLine.length === 0) return;
      const sorted = [...currentLine].sort((a, b) => a.x - b.x);
      lines.push(sorted.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim());
      currentLine = [];
    };

    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= Y_TOLERANCE) {
        currentLine.push(item);
        currentY = currentY ?? item.y;
      } else {
        flushLine();
        currentLine = [item];
        currentY = item.y;
      }
    }
    flushLine();
  }

  return lines.filter((l) => l.length > 0).join('\n');
}

function extractField(text: string, regex: RegExp, campo: string, falhas: string[]): string {
  const match = text.match(regex);
  if (!match || !match[1]) {
    falhas.push(campo);
    return '';
  }
  return match[1].trim();
}

export async function parseIfsClassPdf(file: File): Promise<ParsedClassData> {
  const text = await extractLinedText(file);
  const falhas: string[] = [];

  // --- Curso ---
  // "Curso: 463 - TÉCNICO DE NÍVEL MÉDIO EM ELETRÔNICA (CAMPUS ARACAJU)"
  const curso = extractField(
    text,
    /Curso:\s*(.+?)(?:\n|$)/,
    'curso',
    falhas
  );

  // --- Diário (código, modalidade, disciplina) ---
  // "Diário: 1141 - Subsequente.1086 - INSTALAÇÕES PREDIAIS - Médio [30 h/36 Aulas]"
  const diarioMatch = text.match(
    /Diário:\s*(\d+)\s*-\s*(Subsequente|Integrado)\.?(\d+)?\s*-\s*(.+?)\s*-\s*(?:Médio|Integrado|Técnico)\s*\[/i
  );

  let codigoDiario = '';
  let modalidade: ParsedModalidade | null = null;
  let nomeDisciplina = '';

  if (diarioMatch) {
    codigoDiario = diarioMatch[1];
    modalidade = (diarioMatch[2].charAt(0).toUpperCase() + diarioMatch[2].slice(1).toLowerCase()) as ParsedModalidade;
    nomeDisciplina = diarioMatch[4].trim();
  } else {
    falhas.push('codigoDiario', 'modalidade', 'nomeDisciplina');
  }

  // --- Professores ---
  // "Professores: Jose Valter Alves Santos"
  const professores = extractField(
    text,
    /Professores:\s*(.+?)(?:\n|$)/,
    'professores',
    falhas
  );

  // --- Código da Turma ---
  // "Turma: 20251.4.463.3098125.1N Ano/Período 2025/1 Data: ..."
  const codigoTurma = extractField(
    text,
    /Turma:\s*([\d.]+[A-Z]?)/,
    'codigoTurma',
    falhas
  );

  // --- Ano/Período Letivo ---
  // O rótulo pode vir quebrado: "Ano/Período 2025/1 Data: ...\nLetivo:"
  // Estratégia: capturar o valor no formato AAAA/N logo após "Ano/Período"
  const anoPeriodo = extractField(
    text,
    /Ano\/Período[^0-9]*(\d{4}\/\d)/,
    'anoPeriodo',
    falhas
  );

  // --- Lista de alunos ---
  // Linhas no formato: "1 2023322036 Adson Fonseca Menezes"
  const alunos: ParsedStudent[] = [];
  const studentLineRegex = /^(\d{1,3})\s+(\d{10})\s+(.+)$/;
  for (const line of text.split('\n')) {
    const m = line.match(studentLineRegex);
    if (m) {
      alunos.push({
        numero: parseInt(m[1], 10),
        matricula: m[2],
        nome: m[3].trim(),
      });
    }
  }
  if (alunos.length === 0) falhas.push('alunos');

  return {
    curso,
    codigoDiario,
    modalidade,
    nomeDisciplina,
    professores,
    codigoTurma,
    anoPeriodo,
    alunos,
    camposComFalha: falhas,
    rawText: text,
  };
}
