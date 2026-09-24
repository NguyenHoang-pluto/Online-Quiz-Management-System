import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import configuration from './config/configuration';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { ExamModule } from './modules/exam/exam.module';
import { AttemptModule } from './modules/attempt/attempt.module';
import { ProctoringModule } from './modules/proctoring/proctoring.module';
import { ResultModule } from './modules/result/result.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SmartThrottlerGuard } from './common/guards/smart-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['../../.env'],
    }),
    ScheduleModule.forRoot(),
    // Chặn dò mật khẩu và spam nộp bài
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    RedisModule,
    StorageModule,

    // 6 module nghiệp vụ, khớp 1-1 với 6 module trong file Excel
    AuthModule,        // M1
    UsersModule,       // M1
    CatalogModule,     // M1
    QuestionBankModule,// M2
    ExamModule,        // M3
    AttemptModule,     // M4
    ProctoringModule,  // M5
    ResultModule,      // M6
  ],
  providers: [
    // Mặc định MỌI endpoint đều yêu cầu đăng nhập.
    // Muốn mở công khai thì đánh dấu @Public() trên handler.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Đăng nhập đếm theo tài khoản, phần còn lại đếm theo IP
    { provide: APP_GUARD, useClass: SmartThrottlerGuard },
  ],
})
export class AppModule {}
