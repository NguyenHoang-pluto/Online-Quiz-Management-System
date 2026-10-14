export interface ParsedOption {
  label: string;
  content: string;
  isCorrect: boolean;
}

export type ParsedDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ParsedType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

export interface ParsedQuestion {
  type: ParsedType;
  difficulty: ParsedDifficulty;
  content: string;
  options: ParsedOption[];
}

export interface RowError {
  row: number;
  message: string;
}

/**
 * Quy tac so dap an dung theo tung loai cau hoi (port tu
 * QuestionBankService.validateOptions). Tra ve message loi, hoac null neu hop le.
 * Kiem tra o server, khong tin vao validate phia trinh duyet.
 */
export function validateParsedOptions(type: string, options: ParsedOption[]): string | null {
  const correct = options.filter((o) => o.isCorrect).length;

  if (options.length < 2) return 'Câu hỏi phải có tối thiểu 2 phương án';
  if (correct === 0) return 'Phải chọn ít nhất 1 đáp án đúng';

  if (type === 'SINGLE_CHOICE' && correct !== 1) {
    return 'Câu 1 đáp án chỉ được có đúng 1 phương án đúng';
  }
  if (type === 'TRUE_FALSE') {
    if (options.length !== 2) return 'Câu đúng/sai phải có đúng 2 phương án';
    if (correct !== 1) return 'Câu đúng/sai chỉ được có đúng 1 phương án đúng';
  }
  if (type === 'MULTIPLE_CHOICE' && correct === options.length) {
    return 'Câu nhiều đáp án không thể có tất cả phương án đều đúng';
  }
  return null;
}

/**
 * Boc tach cau hoi tu van ban thuan theo dinh dang quy uoc:
 *
 *     [DE] Noi dung cau hoi co the chua $x^2$
 *     A. phuong an 1
 *     *B. phuong an dung (dau sao dung truoc)
 *     C. phuong an 3
 *
 * Thuan tuy (khong DB, khong IO) de test duoc ma khong can ha tang.
 */
export function parseQuestionMarkdown(text: string): {
  questions: ParsedQuestion[];
  errors: RowError[];
} {
  const DIFF: Record<string, ParsedDifficulty> = {
    DE: 'EASY', TB: 'MEDIUM', KHO: 'HARD',
  };
  const questions: ParsedQuestion[] = [];
  const errors: RowError[] = [];

  const lines = text.split(/\r?\n/);
  let current: { difficulty: ParsedDifficulty; content: string; line: number } | null = null;
  let options: ParsedOption[] = [];

  const flush = () => {
    if (!current) return;
    const correct = options.filter((o) => o.isCorrect).length;
    if (options.length < 2) {
      errors.push({ row: current.line, message: 'Câu hỏi có ít hơn 2 phương án' });
    } else if (correct === 0) {
      errors.push({ row: current.line, message: 'Không có phương án nào đánh dấu * là đúng' });
    } else {
      questions.push({
        type: correct > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
        difficulty: current.difficulty,
        content: current.content,
        options,
      });
    }
    current = null;
    options = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.replace(/\\$/, '').trim();
    if (!line) return;

    const head = line.match(/^\[(DE|TB|KHO)\]\s*(.+)$/i);
    if (head) {
      flush();
      current = {
        difficulty: DIFF[head[1].toUpperCase()],
        content: head[2].trim(),
        line: i + 1,
      };
      return;
    }

    const opt = line.match(/^(\*?)\s*([A-H])[.)]\s*(.+)$/);
    if (opt && current) {
      options.push({ label: opt[2], content: opt[3].trim(), isCorrect: opt[1] === '*' });
      return;
    }

    // Dong tiep noi noi dung cau hoi
    if (current && options.length === 0) {
      current.content += ' ' + line;
    }
  });
  flush();

  return { questions, errors };
}
