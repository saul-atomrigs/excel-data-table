export type Cell = {
  row: number;
  col: number;
};

export type Formula = {
  type: 'value' | 'expression';
  value?: string;
  parts?: string[];
};
