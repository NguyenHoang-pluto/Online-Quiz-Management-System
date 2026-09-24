import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Prisma trả các cột DECIMAL dưới dạng đối tượng Decimal, và JSON.stringify
 * mặc định biến đối tượng đó thành CHUỖI. Frontend nhận "10" rồi gọi
 * .toFixed() sẽ nổ lỗi ngay giữa màn hình sinh viên.
 *
 * Ép về số đúng một lần ở đây, thay vì phải nhớ bọc Number() ở từng endpoint —
 * quên một chỗ là lỗi lại xuất hiện.
 */
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (
  this: Prisma.Decimal,
) {
  return this.toNumber();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // Refresh token nằm trong cookie httpOnly nên bắt buộc credentials: true
  app.enableCors({
    origin: config.get<string>('webOrigin'),
    credentials: true,
  });

  app.setGlobalPrefix(config.get<string>('apiPrefix')!);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  if (config.get<string>('env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EduExam Pro API')
      .setDescription('Hệ thống thi trắc nghiệm trực tuyến — Nhóm 08')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('port')!;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API chạy tại http://localhost:${port}/${config.get('apiPrefix')}`);
  logger.log(`Swagger tại http://localhost:${port}/docs`);
}

void bootstrap();
