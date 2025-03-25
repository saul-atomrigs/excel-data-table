import { Formula } from '../types';

/**
 * 셀 위치를 파싱하는 함수 (예: 'A1' -> { col: 0, row: 0 })
 */
export const getCellPosition = (cellRef: string) => {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell reference: ${cellRef}`);

  const colStr = match[1];
  const rowStr = match[2];

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  col--;

  const row = parseInt(rowStr);
  return { col, row };
};

/**
 * 공식(예: '=A1+B2')을 해석하는 함수
 */
export const parseFormula = (
  formula: string,
  starter = '='
): Formula | null => {
  if (!formula.startsWith(starter)) return null;

  const expression = formula.substring(1).trim();

  const addSubtractParts = expression.split(/([+\-])/).filter(Boolean);

  if (addSubtractParts.length === 1) {
    const mulDivParts = addSubtractParts[0].split(/([*/])/).filter(Boolean);
    if (mulDivParts.length === 1) {
      return {
        type: 'value',
        value: mulDivParts[0].trim(),
      };
    } else {
      return {
        type: 'expression',
        parts: mulDivParts,
      };
    }
  }

  return {
    type: 'expression',
    parts: addSubtractParts,
  };
};

export const adjustFormulaForCell = (
  formula: string,
  sourceCell: { row: number; col: number },
  targetCell: { row: number; col: number }
) => {
  const rowDiff = targetCell.row - sourceCell.row;
  const colDiff = targetCell.col - sourceCell.col;

  return formula.replace(/([A-Z]+)(\d+)/g, (match, colStr, rowStr) => {
    const { col: oldCol, row: oldRow } = getCellPosition(`${colStr}${rowStr}`);
    const newCol = oldCol + colDiff;
    const newRow = oldRow + rowDiff;

    let newColStr = '';
    let tempCol = newCol + 1;
    while (tempCol > 0) {
      const remainder = (tempCol - 1) % 26;
      newColStr = String.fromCharCode(65 + remainder) + newColStr;
      tempCol = Math.floor((tempCol - 1) / 26);
    }

    return `${newColStr}${newRow}`;
  });
};
