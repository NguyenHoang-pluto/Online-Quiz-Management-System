import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { Readable } from 'node:stream';

/**
 * Lop boc MinIO/S3 dung chung cho ca API.
 * Bucket cau hoi public-read (the <img> khong gan duoc Bearer header),
 * bucket bang chung giu private, chi doc qua API co kiem quyen.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: Client;

  readonly questionBucket: string;
  readonly evidenceBucket: string;
  private readonly publicEndpoint: string;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.getOrThrow<string>('s3.endpoint');
    const url = new URL(raw);
    this.client = new Client({
      endPoint: url.hostname,
      port: url.port ? parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80,
      useSSL: url.protocol === 'https:',
      accessKey: this.config.getOrThrow<string>('s3.accessKey'),
      secretKey: this.config.getOrThrow<string>('s3.secretKey'),
      region: this.config.getOrThrow<string>('s3.region'),
    });
    this.questionBucket = this.config.getOrThrow<string>('s3.bucketQuestion');
    this.evidenceBucket = this.config.getOrThrow<string>('s3.bucketEvidence');
    this.publicEndpoint = raw.replace(/\/+$/, '');
  }

  async onModuleInit() {
    await this.ensureBucket(this.questionBucket, true);
    await this.ensureBucket(this.evidenceBucket, false);
    this.logger.log(`Buckets ready: ${this.questionBucket} (public), ${this.evidenceBucket} (private)`);
  }

  private async ensureBucket(bucket: string, publicRead: boolean) {
    if (!(await this.client.bucketExists(bucket))) {
      await this.client.makeBucket(bucket);
    }
    if (publicRead) {
      // Chi GetObject, KHONG mo ListBucket — key co uuid, khong doan duoc.
      await this.client.setBucketPolicy(
        bucket,
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucket}/questions/*`],
            },
          ],
        }),
      );
    }
  }

  put(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    return this.client
      .putObject(bucket, key, buffer, buffer.length, { 'Content-Type': contentType })
      .then(() => undefined);
  }

  async get(bucket: string, key: string): Promise<Buffer | null> {
    try {
      const stream: Readable = (await this.client.getObject(bucket, key)) as unknown as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async remove(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key).catch(() => undefined);
  }

  publicUrl(bucket: string, key: string): string {
    return `${this.publicEndpoint}/${bucket}/${key}`;
  }
}
