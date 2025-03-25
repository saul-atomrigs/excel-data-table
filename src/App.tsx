import { useState, useCallback, useEffect } from 'react';
import { IntersectionObserver } from '@saul-atomrigs/design-system';
import { useScroll } from './hooks';
import { EditableCell } from './components/editable-cell';

type Cell = {
  row: number;
  col: number;
};

const TOTAL_ROWS = 1_000_000;
const TOTAL_COLUMNS = 10;
const BATCH_SIZE = 100;

const baseColumns = Array.from({ length: TOTAL_COLUMNS }, (_, index) =>
  String.fromCharCode(65 + index)
);

const baseRows = Array.from({ length: TOTAL_COLUMNS }, () => '');

/**
 * 셀 위치를 파싱하는 함수 (예: 'A1' -> { col: 0, row: 0 })
 */
const getCellPosition = (cellRef: string) => {
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

interface Formula {
  type: 'value' | 'expression';
  value?: string;
  parts?: string[];
}

/**
 * 공식(예: '=A1+B2')을 해석하는 함수
 */
const parseFormula = (formula: string, starter = '='): Formula | null => {
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

export default function Table() {
  const {
    items: rowIndices,
    isLoading,
    loadMore,
    hasMore,
    scrollContainerRef,
  } = useScroll({
    totalItems: TOTAL_ROWS,
    batchSize: BATCH_SIZE,
  });

  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [calculatedValues, setCalculatedValues] = useState<
    Record<string, string>
  >({});
  const [dependencies, setDependencies] = useState<Record<string, string[]>>(
    {}
  );

  const parseCellReference = (operand: string) => {
    operand = operand.trim();
    if (/^[A-Z]+\d+$/.test(operand)) {
      const { col, row } = getCellPosition(operand);
      return `${row}-${col}`;
    }
    return null;
  };

  const evaluateOperand = (
    operand: string,
    editedData: Record<string, string>,
    dependencies: string[]
  ) => {
    const depKey = parseCellReference(operand);
    if (depKey) {
      dependencies.push(depKey);
      const value = editedData[depKey] || '';
      return value && !isNaN(parseFloat(value)) ? value : '0';
    }
    return operand;
  };

  const processMultiplyDivide = (
    parts: string[],
    evaluateOperand: (op: string) => string
  ) => {
    let i = 1;
    while (i < parts.length) {
      if (parts[i] === '*' || parts[i] === '/') {
        const leftValue = parseFloat(evaluateOperand(parts[i - 1]));
        const rightValue = parseFloat(evaluateOperand(parts[i + 1]));

        if (parts[i] === '/' && rightValue === 0) {
          throw new Error('Division by zero');
        }

        const result =
          parts[i] === '*' ? leftValue * rightValue : leftValue / rightValue;
        parts.splice(i - 1, 3, result.toString());
        i--;
      }
      i += 2;
    }
  };

  const processAddSubtract = (
    parts: string[],
    evaluateOperand: (op: string) => string
  ) => {
    let result = parseFloat(evaluateOperand(parts[0]));
    for (let i = 1; i < parts.length; i += 2) {
      const operator = parts[i];
      const value = parseFloat(evaluateOperand(parts[i + 1]));
      result = operator === '+' ? result + value : result - value;
    }
    return result.toString();
  };

  const evaluateFormula = (
    formula: Formula,
    editedData: Record<string, string>
  ) => {
    const dependencies: string[] = [];
    const evaluate = (operand: string) =>
      evaluateOperand(operand, editedData, dependencies);

    let result;
    if (formula.type === 'value') {
      result = evaluate(formula.value || '');
    } else {
      if (formula.parts) {
        processMultiplyDivide(formula.parts, evaluate);
        result = processAddSubtract(formula.parts, evaluate);
      }
    }

    return { result, dependencies };
  };

  const getCellValue = useCallback(
    (rowIdx: number, colIdx: number) => {
      const key = `${rowIdx}-${colIdx}`;
      const rawValue = editedData[key] || '';

      if (calculatedValues[key]) return calculatedValues[key];
      if (!rawValue.startsWith('=')) return rawValue;

      try {
        const formula = parseFormula(rawValue);
        if (!formula) return rawValue;

        const { result, dependencies } = evaluateFormula(formula, editedData);

        setDependencies((prev) => ({ ...prev, [key]: dependencies }));
        setCalculatedValues((prev) => ({ ...prev, [key]: result || '' }));

        return result || '';
      } catch (error) {
        console.error('Formula evaluation error:', error);
        return `Error: ${error}`;
      }
    },
    [editedData, calculatedValues]
  );

  const updateDependentCells = useCallback(
    (changedKey: string) => {
      const dependentCells = Object.entries(dependencies)
        .filter(([_, deps]) => deps.includes(changedKey))
        .map(([key]) => key);

      if (dependentCells.length > 0) {
        setCalculatedValues((prev) => {
          const newValues = { ...prev };
          dependentCells.forEach((key) => {
            delete newValues[key];
          });
          return newValues;
        });

        dependentCells.forEach((key) => updateDependentCells(key));
      }
    },
    [dependencies]
  );

  const handleCellChange = (
    rowIndex: number,
    colIndex: number,
    newValue: string
  ) => {
    const key = `${rowIndices[rowIndex]}-${colIndex}`;

    setEditedData((prev) => ({
      ...prev,
      [key]: newValue,
    }));

    setCalculatedValues((prev) => {
      const newValues = { ...prev };
      delete newValues[key];
      return newValues;
    });

    updateDependentCells(key);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<Cell | null>(null);
  const [dragEndCell, setDragEndCell] = useState<Cell | null>(null);
  const [selectedCells, setSelectedCells] = useState<Cell[]>([]);

  const handleDragStart = (rowIndex: number, colIndex: number) => {
    setIsDragging(true);
    setDragStartCell({ row: rowIndices[rowIndex], col: colIndex });
    setDragEndCell({ row: rowIndices[rowIndex], col: colIndex });
  };

  const handleDragOver = (rowIndex: number, colIndex: number) => {
    if (isDragging) {
      setDragEndCell({ row: rowIndices[rowIndex], col: colIndex });
    }
  };

  const getSelectedCells = (startCell: Cell, endCell: Cell) => {
    const startRow = Math.min(startCell.row, endCell.row);
    const endRow = Math.max(startCell.row, endCell.row);
    const startCol = Math.min(startCell.col, endCell.col);
    const endCol = Math.max(startCell.col, endCell.col);

    const cells = [];
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        cells.push({ row, col });
      }
    }
    return cells;
  };

  const adjustFormulaForCell = (
    formula: string,
    sourceCell: Cell,
    targetCell: Cell
  ) => {
    const rowDiff = targetCell.row - sourceCell.row;
    const colDiff = targetCell.col - sourceCell.col;

    return formula.replace(/([A-Z]+)(\d+)/g, (match, colStr, rowStr) => {
      const { col: oldCol, row: oldRow } = getCellPosition(
        `${colStr}${rowStr}`
      );
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

  const handleFormulaCopy = (
    cells: Cell[],
    sourceCell: Cell,
    sourceValue: string,
    editedData: Record<string, string>
  ) => {
    const newEditedData = { ...editedData };
    const cellsToUpdate: string[] = [];

    cells.forEach(({ row, col }) => {
      if (row === sourceCell.row && col === sourceCell.col) return;
      const targetKey = `${row}-${col}`;
      newEditedData[targetKey] = adjustFormulaForCell(sourceValue, sourceCell, {
        row,
        col,
      });
      cellsToUpdate.push(targetKey);
    });

    setEditedData(newEditedData);
    setCalculatedValues((prev) => {
      const newValues = { ...prev };
      cellsToUpdate.forEach((key) => delete newValues[key]);
      return newValues;
    });

    setTimeout(() => {
      cellsToUpdate.forEach((key) => {
        const [row, col] = key.split('-').map(Number);
        getCellValue(row, col);
      });
    }, 0);
  };

  const handleValueCopy = (
    cells: Cell[],
    sourceCell: Cell,
    sourceValue: string,
    editedData: Record<string, string>
  ) => {
    const newEditedData = { ...editedData };
    cells.forEach(({ row, col }) => {
      if (row === sourceCell.row && col === sourceCell.col) return;
      newEditedData[`${row}-${col}`] = sourceValue;
    });
    setEditedData(newEditedData);
  };

  const handleDragEnd = () => {
    if (isDragging && dragStartCell && dragEndCell) {
      const cells = getSelectedCells(dragStartCell, dragEndCell);
      setSelectedCells(cells);

      if (cells.length > 1) {
        const sourceKey = `${dragStartCell.row}-${dragStartCell.col}`;
        const sourceValue = editedData[sourceKey] || '';

        if (sourceValue.startsWith('=')) {
          handleFormulaCopy(cells, dragStartCell, sourceValue, editedData);
        } else {
          handleValueCopy(cells, dragStartCell, sourceValue, editedData);
        }
      }
    }

    setIsDragging(false);
    setDragStartCell(null);
    setDragEndCell(null);
    setSelectedCells([]);
  };

  // 선택된 셀인지 확인하는 함수
  const isCellSelected = (rowIndex: number, colIndex: number) => {
    if (!isDragging || !dragStartCell || !dragEndCell) return false;

    const row = rowIndices[rowIndex];
    const startRow = Math.min(dragStartCell.row, dragEndCell.row);
    const endRow = Math.max(dragStartCell.row, dragEndCell.row);
    const startCol = Math.min(dragStartCell.col, dragEndCell.col);
    const endCol = Math.max(dragStartCell.col, dragEndCell.col);

    return (
      row >= startRow &&
      row <= endRow &&
      colIndex >= startCol &&
      colIndex <= endCol
    );
  };

  // 마우스 이벤트 전역 처리
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStartCell, dragEndCell]);

  // 행 인덱스를 실제 행 데이터로 변환
  const rows = rowIndices.map((index) => {
    // 편집된 데이터가 있으면 해당 데이터로 대체
    return baseRows.map((_, colIndex) => {
      return getCellValue(index, colIndex);
    });
  });

  return (
    <div
      style={{
        height: '100vh', // 전체 화면 높이
        width: '100vw', // 전체 화면 너비
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
        padding: 0,
        overflow: 'hidden', // 스크롤바 방지
        position: 'fixed', // 전체 화면 고정
        top: 0,
        left: 0,
      }}
    >
      {/* 컬럼 헤더 추가 */}
      <div
        style={{
          height: '40px',
          backgroundColor: '#f0f0f0',
          borderBottom: '2px solid #ccc',
          display: 'flex',
          alignItems: 'center',
          fontWeight: 'bold',
        }}
      >
        <div style={{ width: '100px', paddingLeft: '10px' }}>데이터 번호</div>
        {baseColumns.map((column, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              padding: '0 10px',
              borderLeft: '1px solid #ccc',
            }}
          >
            {column}
          </div>
        ))}
      </div>

      <main
        ref={scrollContainerRef}
        style={{ flex: 1, overflowY: 'auto', border: '1px solid #ccc' }}
      >
        {rows.map((rowData, rowIndex) => (
          <div
            key={rowIndices[rowIndex]}
            style={{
              height: '30px',
              borderBottom: '1px solid #ddd',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '100px', paddingLeft: '10px' }}>
              {rowIndices[rowIndex]}
            </div>
            {rowData.map((cellData, cellIndex) => (
              <EditableCell
                key={cellIndex}
                value={cellData}
                rawValue={
                  editedData[`${rowIndices[rowIndex]}-${cellIndex}`] || ''
                }
                onChange={(newValue) =>
                  handleCellChange(rowIndex, cellIndex, newValue)
                }
                rowIndex={rowIndex}
                colIndex={cellIndex}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                isDragging={isCellSelected(rowIndex, cellIndex)}
              />
            ))}
          </div>
        ))}
        <IntersectionObserver
          onIntersect={loadMore}
          disabled={!hasMore || isLoading}
        >
          {isLoading && <div>...</div>}
        </IntersectionObserver>
      </main>
    </div>
  );
}
