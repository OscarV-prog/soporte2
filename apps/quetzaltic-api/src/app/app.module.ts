import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { AuditStoreModule } from './audit/audit-store.module';
import { TransactionModule } from './transaction/transaction.module';
import { OperationsModule } from './operations/operations.module';
import { GovernanceModule } from './governance/governance.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FailClosedInterceptor } from './common/interceptors/fail-closed.interceptor';
import { LockdownInterceptor } from './common/interceptors/lockdown.interceptor';
import { OperationalExceptionFilter } from './common/filters/operational-exception.filter';
import { LoggerModule } from 'nestjs-pino';
import { TestController } from './common/test/test.controller';
import { TestOscarModule } from './test-oscar/test-oscar.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        customProps: (req) => ({
          correlationId: req.headers['x-correlation-id'],
        }),
        transport: process.env.NODE_ENV === 'dev'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      },
    }),
    ConfigModule,
    HealthModule,
    CommonModule,
    DatabaseModule,
    AuditStoreModule,
    TransactionModule,
    OperationsModule,
    GovernanceModule,
    AuthModule,
    UsersModule,
    TestOscarModule,
  ],
  controllers: [AppController, TestController],
  providers: [
    AppService,
    // Deshabilitado por petición del usuario - No queremos límites en desarrollo
    // {
    //   provide: APP_GUARD,
    //   useClass: ThrottlerGuard,
    // },
    {
      provide: APP_INTERCEPTOR,
      useClass: FailClosedInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LockdownInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: OperationalExceptionFilter,
    },
  ],
})
export class AppModule { }
