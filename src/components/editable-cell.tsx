import {
  type KeyboardEventHandler,
  type MouseEventHandler,
  useState,
  useRef,
} from 'react';

interface EditableCellProps {
  value: string;
  rawValue?: string;
  onChange: (value: string) => void;
  rowIndex: number;
  colIndex: number;
  onDragStart?: (rowIndex: number, colIndex: number) => void;
  onDragOver?: (rowIndex: number, colIndex: number) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

export const EditableCell = ({
  value,
  rawValue,
  onChange,
  rowIndex,
  colIndex,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const cellRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = () => {
    setInputValue(rawValue || value);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    onChange(inputValue);
  };

  const handleEnterKey = () => {
    setIsEditing(false);
    onChange(inputValue);
  };

  const handleEscapeKey = () => {
    setIsEditing(false);
    setInputValue(rawValue || value);
  };

  const handleKeyDown: KeyboardEventHandler = (e) => {
    if (e.key === 'Enter') {
      handleEnterKey();
    } else if (e.key === 'Escape') {
      handleEscapeKey();
    }
  };

  const handleMouseDown: MouseEventHandler = (e) => {
    const rect = cellRef.current?.getBoundingClientRect();
    if (!rect) return;

    const REFERENCE_WIDTH = 10;
    const isCorner =
      e.clientX >= rect.right - REFERENCE_WIDTH &&
      e.clientY >= rect.bottom - REFERENCE_WIDTH;

    if (isCorner && onDragStart) {
      e.preventDefault();
      onDragStart(rowIndex, colIndex);
    }
  };

  const handleMouseMove = () => {
    if (onDragOver) {
      onDragOver(rowIndex, colIndex);
    }
  };

  const handleMouseUp = () => {
    if (onDragEnd) {
      onDragEnd();
    }
  };

  return (
    <div
      ref={cellRef}
      style={{
        flex: 1,
        borderLeft: '1px solid #ddd',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: isDragging ? 'rgba(74, 144, 226, 0.1)' : 'transparent',
        cursor: isDragging ? 'cell' : 'default',
      }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {isEditing ? (
        <input
          style={{
            width: '100%',
            height: '90%',
            border: 'none',
            outline: '1px solid #4a90e2',
            padding: '0 4px',
          }}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <>
          <span>{value}</span>
          {rawValue?.startsWith('=') && (
            <div
              style={{
                position: 'absolute',
                right: 2,
                top: 2,
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '4px solid #4a90e2',
              }}
            />
          )}

          {/* 드래그 핸들 추가 */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: '10px',
              height: '10px',
              cursor: 'crosshair',
            }}
          />
        </>
      )}
    </div>
  );
};
