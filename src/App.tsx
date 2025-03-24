import { useState, useCallback } from 'react';
import { IntersectionObserver } from '@saul-atomrigs/design-system';
import { useScroll } from './hooks';
import { EditableCell } from './components/editable-cell';

const TOTAL_ROWS = 1_000_000; // 총 100만 개의 데이터
const TOTAL_COLUMNS = 10; // 총 10개의 컬럼
const BATCH_SIZE = 100; // 한 번에 불러올 데이터 개수

// 컬럼 헤더 정의
const baseColumns = Array.from({ length: TOTAL_COLUMNS }, (_, index) =>
  String.fromCharCode(65 + index)
);

// 행 데이터 생성 함수 - 비어있는 데이터로 초기화
const baseRows = Array.from({ length: TOTAL_COLUMNS }, () => '');

// 셀 위치를 파싱하는 함수 (예: 'A1' -> { col: 0, row: 0 })
const parseCellPosition = (cellRef: string) => {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell reference: ${cellRef}`);

  const colStr = match[1];
  const rowStr = match[2];

  // A -> 0, B -> 1, ..., Z -> 25, AA -> 26, ...
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  col--; // 0-based index

  const row = parseInt(rowStr); // 1-based to 0-based
  return { col, row };
};

// 공식 문자열 파싱 함수
const parseFormula = (formula: string, starter = '=') => {
  if (!formula.startsWith(starter)) return null;

  const expression = formula.substring(1).trim();
  // 간단한 덧셈 공식 파싱 (예: A1 + B2)
  const parts = expression.split('+').map((part) => part.trim());
  return {
    operator: '+',
    operands: parts,
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

  // 편집된 데이터를 저장하는 상태
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  // 계산된 셀 값을 캐싱하는 상태
  const [calculatedValues, setCalculatedValues] = useState<
    Record<string, string>
  >({});
  // 셀 의존성 추적
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

        // 공식의 피연산자들의 값을 가져와 계산
        let result = 0;
        const newDependencies: string[] = [];

        for (const operand of formula.operands) {
          if (/^[A-Z]\d+$/.test(operand)) {
            // 셀 참조인 경우 (예: A1, B2)
            const { col, row } = parseCellPosition(operand);
            const depKey = `${row}-${col}`;
            newDependencies.push(depKey);

            const value = editedData[depKey] || '';
            const numValue = value ? parseFloat(value) : 0;
            result += isNaN(numValue) ? 0 : numValue;
          } else {
            // 숫자인 경우
            result += parseFloat(operand) || 0;
          }
        }

        // 의존성 업데이트
        setDependencies((prev) => ({
          ...prev,
          [key]: newDependencies,
        }));

        // 계산된 값 캐싱
        const calculated = result.toString();
        setCalculatedValues((prev) => ({
          ...prev,
          [key]: calculated,
        }));

        return calculated;
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
