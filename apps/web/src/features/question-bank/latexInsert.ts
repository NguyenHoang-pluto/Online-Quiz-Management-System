export const STRUCTURED_TEMPLATES = [
  { label: 'Phân số', snippet: '\\frac{}{}' },
  { label: 'Căn', snippet: '\\sqrt{}' },
  { label: 'Luỹ thừa', snippet: '^{}' },
  { label: 'Chỉ số dưới', snippet: '_{}' },
  { label: 'Ma trận', snippet: '\\begin{matrix} & \\\\ & \\end{matrix}' },
];

/** Chèn LaTeX tại con trỏ và trả về vị trí con trỏ mới. */
export function insertLatex(
  value: string,
  cursor: number | null,
  snippet: string,
): { value: string; cursor: number } {
  const at = cursor ?? value.length;
  return {
    value: value.slice(0, at) + snippet + value.slice(at),
    cursor: at + snippet.length,
  };
}
