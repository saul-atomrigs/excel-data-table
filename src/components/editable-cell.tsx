import { KeyboardEventHandler, useState } from 'react';

interface EditableCellProps {
  value: string;
  rawValue?: string;
  onChange: (value: string) => void;
}

export const EditableCell = ({
  value,
  rawValue,
  onChange,
}: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleDoubleClick = () => {
    setInputValue(rawValue || value);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    onChange(inputValue);
  };

  const handleKeyDown: KeyboardEventHandler = (e) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      onChange(inputValue);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue(rawValue || value);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        borderLeft: '1px solid #ddd',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        overflow: 'hidden',
        position: 'relative',
      }}
      onDoubleClick={handleDoubleClick}
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
        </>
      )}
    </div>
  );
};
