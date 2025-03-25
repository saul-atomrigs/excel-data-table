import React from 'react';
import { EditableCell } from './editable-cell';

interface TableRowProps {
  rowData: string[];
  rowIndex: number;
  rowNumber: number;
  editedData: Record<string, string>;
  onCellChange: (rowIndex: number, colIndex: number, newValue: string) => void;
  onDragStart: (rowIndex: number, colIndex: number) => void;
  onDragOver: (rowIndex: number, colIndex: number) => void;
  onDragEnd: () => void;
  isCellSelected: (rowIndex: number, colIndex: number) => boolean;
}

export const TableRow: React.FC<TableRowProps> = ({
  rowData,
  rowIndex,
  rowNumber,
  editedData,
  onCellChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  isCellSelected,
}) => {
  return (
    <div className='row'>
      <div className='row-index'>{rowNumber}</div>
      {rowData.map((cellData, cellIndex) => (
        <EditableCell
          key={cellIndex}
          value={cellData}
          rawValue={editedData[`${rowNumber}-${cellIndex}`] || ''}
          onChange={(newValue) => onCellChange(rowIndex, cellIndex, newValue)}
          rowIndex={rowIndex}
          colIndex={cellIndex}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          isDragging={isCellSelected(rowIndex, cellIndex)}
        />
      ))}
    </div>
  );
};
