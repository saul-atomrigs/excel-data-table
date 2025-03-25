import { useState, useCallback, useEffect } from 'react';
import { IntersectionObserver } from '@saul-atomrigs/design-system';
import { useScroll } from './hooks';
import { EditableCell } from './components/editable-cell';

type Cell = {
  row: number;
  col: number;
} | null;

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

/**
 * 공식(예: '=A1+B2')을 해석하는 함수
 */
const parseFormula = (formula: string, starter = '=') => {
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

  // 셀 값 가져오기 (공식 계산 포함)
  const getCellValue = useCallback(
    (rowIdx: number, colIdx: number) => {
      const key = `${rowIdx}-${colIdx}`;
      const rawValue = editedData[key] || '';

      // 계산된 값이 있으면 반환
      if (calculatedValues[key]) {
        return calculatedValues[key];
      }

      // 공식이 아니면 원래 값 반환
      if (!rawValue.startsWith('=')) {
        return rawValue;
      }

      try {
        const formula = parseFormula(rawValue);
        if (!formula) return rawValue;

        // 의존성 추적을 위한 배열
        const newDependencies: string[] = [];

        // 공식 계산 함수
        const evaluateExpression = (parts: string[]) => {
          // 곱셈과 나눗셈을 먼저 처리
          const processMultiplyDivide = () => {
            let i = 1;
            while (i < parts.length) {
              if (parts[i] === '*' || parts[i] === '/') {
                const leftValue = parseFloat(evaluateOperand(parts[i - 1]));
                const rightValue = parseFloat(evaluateOperand(parts[i + 1]));

                let result;
                if (parts[i] === '*') {
                  result = leftValue * rightValue;
                } else {
                  // 0으로 나누기 처리
                  if (rightValue === 0) {
                    throw new Error('Division by zero');
                  }
                  result = leftValue / rightValue;
                }

                // 계산 결과로 배열 요소 대체
                parts.splice(i - 1, 3, result.toString());
                i--;
              }
              i += 2;
            }
          };

          // 개별 피연산자 평가
          const evaluateOperand = (operand: string) => {
            operand = operand.trim();
            if (/^[A-Z]+\d+$/.test(operand)) {
              // 셀 참조인 경우 (예: A1, B2)
              const { col, row } = getCellPosition(operand);
              const depKey = `${row}-${col}`;
              newDependencies.push(depKey);

              const value = editedData[depKey] || '';
              // 숫자가 아니라면 0으로 처리
              return value && !isNaN(parseFloat(value)) ? value : '0';
            }
            return operand; // 숫자 그대로 반환
          };

          // 연산자 우선순위대로 계산
          // 1. 곱셈과 나눗셈 먼저 처리
          processMultiplyDivide();

          // 2. 덧셈과 뺄셈 처리
          let result = parseFloat(evaluateOperand(parts[0]));
          for (let i = 1; i < parts.length; i += 2) {
            const operator = parts[i];
            const operand = evaluateOperand(parts[i + 1]);
            const value = parseFloat(operand);

            if (operator === '+') {
              result += value;
            } else if (operator === '-') {
              result -= value;
            }
          }

          return result.toString();
        };

        let result;

        if (formula.type === 'value') {
          // 단일 값 또는 셀 참조
          result = evaluateOperand(formula.value);
        } else {
          // 복합 표현식
          result = evaluateExpression(formula.parts);
        }

        // 의존성 업데이트
        setDependencies((prev) => ({
          ...prev,
          [key]: newDependencies,
        }));

        // 계산된 값 캐싱
        setCalculatedValues((prev) => ({
          ...prev,
          [key]: result,
        }));

        return result;
      } catch (error) {
        console.error('Formula evaluation error:', error);
        return `Error: ${error}`;
      }
    },
    [editedData, calculatedValues]
  );

  // 의존성이 있는 셀 업데이트
  const updateDependentCells = useCallback(
    (changedKey: string) => {
      // 이 셀에 의존하는 모든 셀 찾기
      const dependentCells = Object.entries(dependencies)
        .filter(([_, deps]) => deps.includes(changedKey))
        .map(([key]) => key);

      // 의존하는 셀들의 계산된 값 초기화
      if (dependentCells.length > 0) {
        setCalculatedValues((prev) => {
          const newValues = { ...prev };
          dependentCells.forEach((key) => {
            delete newValues[key];
          });
          return newValues;
        });

        // 의존성이 있는 셀들도 재귀적으로 업데이트
        dependentCells.forEach((key) => updateDependentCells(key));
      }
    },
    [dependencies]
  );

  // 셀 값 변경 핸들러
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

    // 계산된 값 초기화
    setCalculatedValues((prev) => {
      const newValues = { ...prev };
      delete newValues[key];
      return newValues;
    });

    // 이 셀에 의존하는 다른 셀들 업데이트
    updateDependentCells(key);
  };

  // 드래그 관련 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<Cell>(null);
  const [dragEndCell, setDragEndCell] = useState<Cell>(null);
  const [selectedCells, setSelectedCells] = useState<Cell[]>([]);

  // 드래그 시작 핸들러
  const handleDragStart = (rowIndex: number, colIndex: number) => {
    setIsDragging(true);
    setDragStartCell({ row: rowIndices[rowIndex], col: colIndex });
    setDragEndCell({ row: rowIndices[rowIndex], col: colIndex });
  };

  // 드래그 중 핸들러
  const handleDragOver = (rowIndex: number, colIndex: number) => {
    if (isDragging) {
      setDragEndCell({ row: rowIndices[rowIndex], col: colIndex });
    }
  };

  // 드래그 종료 핸들러
  const handleDragEnd = () => {
    if (isDragging && dragStartCell && dragEndCell) {
      // 선택된 셀 범위 계산
      const startRow = Math.min(dragStartCell.row, dragEndCell.row);
      const endRow = Math.max(dragStartCell.row, dragEndCell.row);
      const startCol = Math.min(dragStartCell.col, dragEndCell.col);
      const endCol = Math.max(dragStartCell.col, dragEndCell.col);

      const cells = [];
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          cells.push({ row, col });
        }
      }
      setSelectedCells(cells);

      // 시작 셀의 값이나 공식을 다른 선택된 셀들에 적용
      if (cells.length > 1) {
        const sourceKey = `${dragStartCell.row}-${dragStartCell.col}`;
        const sourceValue = editedData[sourceKey] || '';

        // 소스 셀이 공식인 경우, 셀 참조를 조정
        if (sourceValue.startsWith('=')) {
          const newEditedData = { ...editedData };
          const cellsToUpdate: string[] = [];

          cells.forEach(({ row, col }) => {
            if (row === dragStartCell.row && col === dragStartCell.col) return; // 시작 셀은 건너뛰기

            const rowDiff = row - dragStartCell.row;
            const colDiff = col - dragStartCell.col;

            // 공식 내의 셀 참조 조정
            let adjustedFormula = sourceValue;
            adjustedFormula = adjustedFormula.replace(
              /([A-Z]+)(\d+)/g,
              (match, colStr, rowStr) => {
                const { col: oldCol, row: oldRow } = getCellPosition(
                  `${colStr}${rowStr}`
                );
                const newCol = oldCol + colDiff;
                const newRow = oldRow + rowDiff;

                // 컬럼 문자 계산 (0 => A, 1 => B, ...)
                let newColStr = '';
                let tempCol = newCol + 1; // 0-based to 1-based
                while (tempCol > 0) {
                  const remainder = (tempCol - 1) % 26;
                  newColStr = String.fromCharCode(65 + remainder) + newColStr;
                  tempCol = Math.floor((tempCol - 1) / 26);
                }

                return `${newColStr}${newRow}`;
              }
            );

            const targetKey = `${row}-${col}`;
            newEditedData[targetKey] = adjustedFormula;
            cellsToUpdate.push(targetKey);
          });

          setEditedData(newEditedData);

          // 계산된 값 캐시 초기화
          setCalculatedValues((prev) => {
            const newValues = { ...prev };
            cellsToUpdate.forEach((key) => {
              delete newValues[key];
            });
            return newValues;
          });

          // 새로 복사된 셀들의 계산된 값을 강제로 업데이트
          // setTimeout을 사용하여 state 업데이트 후 실행되도록 함
          setTimeout(() => {
            cellsToUpdate.forEach((key) => {
              const [row, col] = key.split('-').map(Number);
              // 계산된 값 갱신을 위해 getCellValue 호출
              getCellValue(row, col);
            });
          }, 0);
        } else {
          // 일반 값인 경우 그대로 복사
          const newEditedData = { ...editedData };

          cells.forEach(({ row, col }) => {
            if (row === dragStartCell.row && col === dragStartCell.col) return; // 시작 셀은 건너뛰기
            const targetKey = `${row}-${col}`;
            newEditedData[targetKey] = sourceValue;
          });

          setEditedData(newEditedData);
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
