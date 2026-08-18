/**
 * Engine de cálculo de notas — regras pedagógicas IFS.
 * Todas as funções são puras (sem efeitos colaterais, sem I/O).
 */

export type SituacaoParcial = 'APROVADO' | 'RECUPERAÇÃO' | 'CURSANDO';
export type SituacaoFinal = 'APROVADO' | 'REPROVADO' | 'CURSANDO';

// ============================================================
// 1. Soma de TRs
// ============================================================

/** Soma simples de todas as notas de trabalhos lançados na etapa. */
export function somaTr(trNotas: Record<string, number | null | undefined>): number {
  return Object.values(trNotas).reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

// ============================================================
// 2. Prova Total (combinação TR + Prova)
// ============================================================

/**
 * PROVA_BRUTA = SOMA_TR + (PROVA * (1 - (min(SOMA_TR, 10) / 10)))
 * O fator de SOMA_TR é limitado (cap) em 10 para que (1 - SOMA_TR/10) nunca fique negativo.
 * Retorna null se a nota da prova não foi lançada.
 */
export function calcularProvaBruta(
  trNotas: Record<string, number | null | undefined>,
  nota_prova: number | null | undefined
): number | null {
  if (nota_prova === null || nota_prova === undefined) return null;

  const soma = somaTr(trNotas);
  const somaCapped = Math.min(soma, 10);
  const fator = 1 - somaCapped / 10;

  return soma + nota_prova * fator;
}

// ============================================================
// 3. Arredondamento customizado em degraus de 0,5
// ============================================================

/**
 * Arredonda um valor para o degrau de 0,5 mais próximo, conforme a regra:
 * frac < 0.25        → floor(v)
 * 0.25 <= frac < 0.75 → floor(v) + 0.5
 * frac >= 0.75        → floor(v) + 1.0
 */
export function arredondarDegrau(valor: number): number {
  const base = Math.floor(valor);
  const frac = valor - base;

  if (frac < 0.25) return base;
  if (frac < 0.75) return base + 0.5;
  return base + 1.0;
}

/**
 * PROVA_TOTAL = arredondarDegrau(PROVA_BRUTA).
 * Retorna null se PROVA_BRUTA for null (prova não lançada).
 */
export function calcularProvaTotal(
  trNotas: Record<string, number | null | undefined>,
  nota_prova: number | null | undefined
): number | null {
  const bruta = calcularProvaBruta(trNotas, nota_prova);
  if (bruta === null) return null;
  return arredondarDegrau(bruta);
}

// ============================================================
// 4. Recuperação de Prova e Laboratório
// ============================================================

/** PROVA_COM_RECP = MAX(PROVA_TOTAL, PROVA_RECP). Ignora valores não lançados. */
export function calcularProvaComRecp(
  provaTotal: number | null | undefined,
  provaRecp: number | null | undefined
): number | null {
  if (provaTotal === null || provaTotal === undefined) {
    return provaRecp ?? null;
  }
  if (provaRecp === null || provaRecp === undefined) {
    return provaTotal;
  }
  return Math.max(provaTotal, provaRecp);
}

/** Média aritmética das notas de práticas de laboratório lançadas. Null se nenhuma lançada. */
export function calcularMediaLab(
  notasPraticasLab: Record<string, number | null | undefined>
): number | null {
  const valores = Object.values(notasPraticasLab).filter(
    (v): v is number => v !== null && v !== undefined
  );
  if (valores.length === 0) return null;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

/** LAB_COM_RECP = MAX(MEDIA_LAB, LAB_RECP). Ignora valores não lançados. */
export function calcularLabComRecp(
  mediaLab: number | null | undefined,
  labRecp: number | null | undefined
): number | null {
  if (mediaLab === null || mediaLab === undefined) {
    return labRecp ?? null;
  }
  if (labRecp === null || labRecp === undefined) {
    return mediaLab;
  }
  return Math.max(mediaLab, labRecp);
}

// ============================================================
// 5. Média da Etapa
// ============================================================

export interface EtapaGradeInput {
  tr_notas: Record<string, number | null | undefined>;
  nota_prova: number | null | undefined;
  nota_prova_recp: number | null | undefined;
  notas_praticas_lab: Record<string, number | null | undefined>;
  nota_lab_recp: number | null | undefined;
}

export interface EtapaGradeResult {
  somaTr: number;
  provaBruta: number | null;
  provaTotal: number | null;
  provaComRecp: number | null;
  mediaLab: number | null;
  labComRecp: number | null;
  notaEtapa: number | null;
}

/**
 * Calcula a Nota da Etapa (nota bimestral/da etapa).
 *
 * Com laboratório:
 *   NOTA_ETAPA = ((PROVA_COM_RECP * peso_prova) + (LAB_COM_RECP * peso_lab)) / (peso_prova + peso_lab)
 *   Exceção: se não houver nenhuma nota de laboratório lançada na etapa, NOTA_ETAPA = PROVA_COM_RECP.
 *
 * Sem laboratório:
 *   NOTA_ETAPA = PROVA_COM_RECP
 */
export function calcularNotaEtapa(
  input: EtapaGradeInput,
  temLaboratorio: boolean,
  pesoProva: number,
  pesoLab: number
): EtapaGradeResult {
  const soma = somaTr(input.tr_notas);
  const provaBruta = calcularProvaBruta(input.tr_notas, input.nota_prova);
  const provaTotal = calcularProvaTotal(input.tr_notas, input.nota_prova);
  const provaComRecp = calcularProvaComRecp(provaTotal, input.nota_prova_recp);
  const mediaLab = calcularMediaLab(input.notas_praticas_lab);
  const labComRecp = calcularLabComRecp(mediaLab, input.nota_lab_recp);

  let notaEtapa: number | null;

  if (!temLaboratorio) {
    notaEtapa = provaComRecp;
  } else if (mediaLab === null && input.nota_lab_recp == null) {
    // Nenhuma nota de laboratório lançada na etapa → cai na exceção.
    notaEtapa = provaComRecp;
  } else if (provaComRecp === null) {
    notaEtapa = null;
  } else {
    const pesoTotal = pesoProva + pesoLab;
    notaEtapa =
      pesoTotal === 0
        ? provaComRecp
        : (provaComRecp * pesoProva + (labComRecp ?? 0) * pesoLab) / pesoTotal;
  }

  return { somaTr: soma, provaBruta, provaTotal, provaComRecp, mediaLab, labComRecp, notaEtapa };
}

// ============================================================
// 6. Consolidação Final do Aluno
// ============================================================

export interface ConsolidacaoInput {
  /** Nota de cada etapa já calculada (calcularNotaEtapa().notaEtapa), na ordem das etapas. */
  notasEtapas: (number | null)[];
  /** Prova final do aluno, se realizada. */
  notaProvaFinal: number | null | undefined;
}

export interface ConsolidacaoResult {
  pontosAcumulados: number;
  mediaParcial: number | null;
  situacaoParcial: SituacaoParcial;
  mediaFinal: number | null;
  situacaoFinal: SituacaoFinal;
}

/**
 * Consolida o resultado final do aluno a partir das notas de cada etapa.
 *
 * Situação Parcial:
 *   - "CURSANDO" se faltar a nota de prova de qualquer etapa (notaEtapa === null).
 *   - "APROVADO" se Média Parcial >= 6.0.
 *   - "RECUPERAÇÃO" se Média Parcial < 6.0.
 *
 * Média Final:
 *   - Se Média Parcial >= 6.0 → permanece a Média Parcial.
 *   - Se Média Parcial < 6.0 e há Prova Final lançada → (Média Parcial + Prova Final) / 2.
 *
 * Situação Final:
 *   - "CURSANDO" se a Situação Parcial for "CURSANDO", OU se estiver em "RECUPERAÇÃO"
 *     sem Prova Final lançada ainda (nota indecisa em ambos os casos).
 *   - "APROVADO" se Média Final >= 5.0.
 *   - "REPROVADO" se Média Final < 5.0.
 */
export function consolidarAluno(input: ConsolidacaoInput): ConsolidacaoResult {
  const { notasEtapas, notaProvaFinal } = input;

  const etapasPreenchidas = notasEtapas.filter((n): n is number => n !== null);
  const faltaAlgumaEtapa = etapasPreenchidas.length < notasEtapas.length;

  const pontosAcumulados = etapasPreenchidas.reduce((acc, n) => acc + n, 0);
  const mediaParcial = faltaAlgumaEtapa
    ? null
    : pontosAcumulados / notasEtapas.length;

  let situacaoParcial: SituacaoParcial;
  if (faltaAlgumaEtapa || mediaParcial === null) {
    situacaoParcial = 'CURSANDO';
  } else if (mediaParcial >= 6.0) {
    situacaoParcial = 'APROVADO';
  } else {
    situacaoParcial = 'RECUPERAÇÃO';
  }

  const temProvaFinal = notaProvaFinal !== null && notaProvaFinal !== undefined;

  let mediaFinal: number | null = null;
  let situacaoFinal: SituacaoFinal;

  if (situacaoParcial === 'CURSANDO') {
    situacaoFinal = 'CURSANDO';
  } else if (situacaoParcial === 'APROVADO') {
    mediaFinal = mediaParcial;
    situacaoFinal = mediaFinal! >= 5.0 ? 'APROVADO' : 'REPROVADO';
  } else {
    // RECUPERAÇÃO
    if (!temProvaFinal) {
      situacaoFinal = 'CURSANDO';
    } else {
      mediaFinal = (mediaParcial! + notaProvaFinal!) / 2;
      situacaoFinal = mediaFinal >= 5.0 ? 'APROVADO' : 'REPROVADO';
    }
  }

  return { pontosAcumulados, mediaParcial, situacaoParcial, mediaFinal, situacaoFinal };
}
