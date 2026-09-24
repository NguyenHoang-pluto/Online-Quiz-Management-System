import { useMemo } from 'react';
import katex from 'katex';

interface Props {
  /** Nội dung có lẫn LaTeX: $...$ cho công thức trong dòng, $$...$$ cho công thức khối */
  content: string;
  className?: string;
}

/**
 * Hiển thị nội dung câu hỏi có công thức toán — chức năng 2.4.
 *
 * Ba thiết lập bảo mật bắt buộc, dùng chung cho toàn hệ thống:
 *   throwOnError: false — LaTeX sai cú pháp chỉ hiện đỏ, không làm trắng cả trang thi
 *   trust: false        — chặn \href, \includegraphics dẫn tới XSS
 *   maxExpand           — chặn "LaTeX bomb" làm treo trình duyệt sinh viên
 */
const KATEX_OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  errorColor: '#dc2626',
  trust: false,
  maxExpand: 1000,
  strict: false,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function MathContent({ content, className = '' }: Props) {
  const html = useMemo(() => {
    // Tách theo $$...$$ trước rồi tới $...$; phần văn bản thường phải escape
    // vì nội dung do giảng viên nhập hoặc import từ Word.
    return content
      .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
      .map((part) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return katex.renderToString(part.slice(2, -2), {
            ...KATEX_OPTIONS,
            displayMode: true,
          });
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return katex.renderToString(part.slice(1, -1), {
            ...KATEX_OPTIONS,
            displayMode: false,
          });
        }
        return escapeHtml(part);
      })
      .join('');
  }, [content]);

  return (
    <div
      className={`question-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
