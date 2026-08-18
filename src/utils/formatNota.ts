/**
 * Formata um valor numérico com exatamente 1 casa decimal, no padrão
 * exigido em toda a UI (TRs, Provas, Laboratórios, Pesos, Médias).
 * Retorna um placeholder (— por padrão) para valores ausentes.
 */
export function formatNota(value: number | null | undefined, placeholder = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return placeholder;
  return value.toFixed(1);
}
