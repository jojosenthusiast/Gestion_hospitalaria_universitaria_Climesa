import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { HealthModule } from './health/health.module';
import { SupabaseModule } from './supabase/supabase.module';
import { PatientsModule } from './patients/patients.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlatformModule } from './platform/platform.module';
import { OperationsModule } from './operations/operations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().port().default(3000),
        API_PREFIX: Joi.string().default('api/v1'),
        WEB_APP_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:5173'),
        SUPABASE_URL: Joi.string().uri({ scheme: ['http','https'] }).default('https://gvmvmrusscsfbndnbvbr.supabase.co'),
        SUPABASE_PUBLISHABLE_KEY: Joi.string().allow('').default(''),
        SUPABASE_SECRET_KEY: Joi.string().allow('').default(''),
        SUPABASE_SERVICE_ROLE_KEY: Joi.string().allow('').default(''),
        DATABASE_URL: Joi.string().allow('').default(''),
      }),
    }),
    SupabaseModule,
    PlatformModule,
    PatientsModule,
    AuthModule,
    UsersModule,
    HealthModule,
    OperationsModule,
  ],
})
export class AppModule {}
