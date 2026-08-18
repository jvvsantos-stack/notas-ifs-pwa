import { useCallback, useRef } from 'react';

/**
 * Gerencia navegação por teclado estilo planilha entre inputs de uma grid.
 * Cada célula registra seu elemento via `registerCell(row, col, el)`.
 * `handleKeyDown` decide o próximo alvo com base na tecla pressionada e
 * move o foco (e seleciona o conteúdo, para digitação rápida).
 *
 * row/col são índices lógicos definidos por quem monta a grid — não
 * precisam corresponder a posições reais de <tr>/<td>, apenas precisam
 * ser consistentes entre o registro e a navegação.
 */
export function useSpreadsheetNavigation() {
  const cells = useRef<Map<string, HTMLInputElement>>(new Map());

  const key = (row: number, col: number) => `${row}:${col}`;

  const registerCell = useCallback((row: number, col: number, el: HTMLInputElement | null) => {
    const k = key(row, col);
    if (el) cells.current.set(k, el);
    else cells.current.delete(k);
  }, []);

  const focusCell = useCallback((row: number, col: number) => {
    const el = cells.current.get(key(row, col));
    if (el) {
      el.focus();
      el.select();
      return true;
    }
    return false;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number, maxCol: number) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          focusCell(row - 1, col);
          break;
        case 'ArrowDown':
          e.preventDefault();
          focusCell(row + 1, col);
          break;
        case 'ArrowLeft':
          // Só intercepta se o cursor já está no início do campo, para não
          // atrapalhar a edição normal de texto/número dentro da célula.
          if ((e.target as HTMLInputElement).selectionStart === 0) {
            e.preventDefault();
            focusCell(row, col - 1);
          }
          break;
        case 'ArrowRight':
          if (
            (e.target as HTMLInputElement).selectionStart ===
            (e.target as HTMLInputElement).value.length
          ) {
            e.preventDefault();
            focusCell(row, col + 1);
          }
          break;
        case 'Enter':
          e.preventDefault();
          focusCell(row + 1, col);
          break;
        case 'Tab':
          // Deixa o comportamento nativo de Tab funcionar como fallback,
          // mas tenta primeiro navegar dentro da grid lógica.
          e.preventDefault();
          if (e.shiftKey) {
            if (col > 0) focusCell(row, col - 1);
            else focusCell(row - 1, maxCol - 1);
          } else {
            if (col < maxCol - 1) focusCell(row, col + 1);
            else focusCell(row + 1, 0);
          }
          break;
        default:
          break;
      }
    },
    [focusCell]
  );

  return { registerCell, handleKeyDown };
}
