import React from 'react';

interface TableHeaderProps {
  columns: string[];
}

export const TableHeader: React.FC<TableHeaderProps> = ({ columns }) => {
  return (
    <div className='header'>
      <div className='header-cell'>데이터 번호</div>
      {columns.map((column, index) => (
        <div key={index} className='header-column'>
          {column}
        </div>
      ))}
    </div>
  );
};
