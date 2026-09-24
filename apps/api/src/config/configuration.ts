/**
 * Tập trung toàn bộ biến môi trường vào một chỗ.
 * Không đọc process.env rải rác trong code — khó test và dễ sai tên biến.
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
    bucketQuestion: process.env.S3_BUCKET_QUESTION ?? 'eduexam-questions',
    bucketEvidence: process.env.S3_BUCKET_EVIDENCE ?? 'eduexam-evidence',
  },

  proctoring: {
    batchIntervalMs: parseInt(process.env.PROCTOR_BATCH_INTERVAL_MS ?? '5000', 10),
    evidenceRetentionDays: parseInt(process.env.PROCTOR_EVIDENCE_RETENTION_DAYS ?? '30', 10),
  },

  pandoc: {
    bin: process.env.PANDOC_BIN ?? 'pandoc',
    timeoutMs: parseInt(process.env.PANDOC_TIMEOUT_MS ?? '30000', 10),
  },
});
