import { useState, useCallback, useEffect } from 'react';
import { IntersectionObserver, Loading } from '@saul-atomrigs/design-system';
import { useScroll } from './hooks';
import { BATCH_SIZE, TOTAL_COLUMNS, TOTAL_ROWS } from './constants';
import { Cell, Formula } from './types';
import { TableHeader } from './components/table-header';
import { TableRow } from './components/table-row';
import {
  getCellPosition,
  parseFormula,
  adjustFormulaForCell,
} from './utils/cellUtils';
import './App.css';

const baseColumns = Array.from({ length: TOTAL_COLUMNS }, (_, index) =>
  String.fromCharCode(65 + index)
);

const baseRows = Array.from({ length: TOTAL_COLUMNS }, () => '');

export default function App() {
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
  };

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

  const rows = rowIndices.map((index) => {
    return baseRows.map((_, colIndex) => {
      return getCellValue(index, colIndex);
    });
  });

  return (
    <div className='container'>
      <TableHeader columns={baseColumns} />

      <main ref={scrollContainerRef} className='table-container'>
        {rows.map((rowData, rowIndex) => (
          <TableRow
            key={rowIndices[rowIndex]}
            rowData={rowData}
            rowIndex={rowIndex}
            rowNumber={rowIndices[rowIndex]}
            editedData={editedData}
            onCellChange={handleCellChange}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            isCellSelected={isCellSelected}
          />
        ))}
        <IntersectionObserver
          onIntersect={loadMore}
          disabled={!hasMore || isLoading}
        >
          {isLoading && <Loading />}
        </IntersectionObserver>
      </main>
    </div>
  );
}
