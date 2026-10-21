import { BadRequestException, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const logger = new Logger('WordConverter');

/**
 * Chay Pandoc chuyen .docx sang Markdown kem cong thuc LaTeX.
 *
 * Pandoc chay voi thoi gian cho gioi han: file Word hong co the lam
 * tien trinh treo vo han va chiem het tai nguyen may chu.
 */
export async function convertDocxToMarkdown(
  buffer: Buffer,
  pandocBin: string,
  timeoutMs: number,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'eduexam-pandoc-'));
  const docxPath = join(dir, 'input.docx');
  await writeFile(docxPath, buffer);

  try {
    const { stdout } = await execFileAsync(
      pandocBin,
      [docxPath, '-f', 'docx', '-t', 'markdown', '--wrap=none'],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
    );
    return stdout;
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    logger.error(`Pandoc lỗi: ${err.message}`);
    throw new BadRequestException(
      err.code === 'ENOENT'
        ? 'Chưa cài Pandoc trên máy chủ. Xem hướng dẫn trong README.'
        : `Không đọc được file Word: ${err.message}`,
    );
  } finally {
    await unlink(docxPath).catch(() => undefined);
  }
}
