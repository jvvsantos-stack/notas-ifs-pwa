/**
 * Formata um valor numérico com exatamente 1 casa decimal e vírgula como
 * separador decimal (padrão brasileiro), usado em toda a exibição de
 * notas, médias e pesos na UI — tabelas, cards, resumos e modais.
 *
 * Aceita number, string (já com vírgula ou ponto), null ou undefined.
 * Retorna um placeholder ('-' por padrão) para valores ausentes ou
 * inválidos.
 */
export function formatNota(
  valor: string | number | null | undefined,
  placeholder = '-'
): string {
  if (valor === '' || valor === null || valor === undefined) return placeholder;

  const num = typeof valor === 'string' ? parseFloat(valor.replace(',', '.')) : valor;

  if (Number.isNaN(num)) return placeholder;

  return num.toFixed(1).replace('.', ',');
}

/**
 * Converte o texto digitado por um professor num campo de nota (que pode
 * usar vírgula ou ponto, ex: "7,5" ou "7.5") para o número que deve ser
 * persistido no banco. Retorna null para texto vazio ou não numérico —
 * nunca lança exceção, então é seguro chamar diretamente a partir de um
 * onBlur sem try/catch.
 */
export function parseNota(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === '') return null;

  const num = parseFloat(limpo.replace(',', '.'));
  if (Number.isNaN(num)) return null;

  return num;
}
