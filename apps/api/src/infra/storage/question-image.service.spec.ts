import sharp from 'sharp';

import { QuestionImageService } from './question-image.service';
import type { ObjectStorageService } from './object-storage.service';

const MAX_BYTES = 5 * 1024 * 1024;

function storageStub() {
  return {
    questionBucket: 'eduexam-questions',
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    publicUrl: jest.fn((_bucket: string, key: string) => `http://localhost:9000/x/${key}`),
  } as unknown as ObjectStorageService & { put: jest.Mock; remove: jest.Mock };
}

async function onePxPng(): Promise<Buffer> {
  return sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

describe('QuestionImageService.upload', () => {
  test('rejects buffers larger than 5MB', async () => {
    const storage = storageStub();
    const svc = new QuestionImageService(storage);
    const big = Buffer.alloc(MAX_BYTES + 1, 0);
    await expect(svc.upload('q1', big, 'image/png')).rejects.toThrow(/5MB|quá lớn|too large/i);
    expect(storage.put).not.toHaveBeenCalled();
  });

  test('rejects non-image content regardless of claimed mimetype', async () => {
    const storage = storageStub();
    const svc = new QuestionImageService(storage);
    await expect(svc.upload('q1', Buffer.from('not an image'), 'image/png')).rejects.toThrow();
    expect(storage.put).not.toHaveBeenCalled();
  });

  test('accepts a 1px png and returns a public URL with dimensions', async () => {
    const storage = storageStub();
    const svc = new QuestionImageService(storage);
    const result = await svc.upload('q1', await onePxPng(), 'image/png');
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toContain('questions/q1/');
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });
});
