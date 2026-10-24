import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PermissionGuard } from './permission.guard';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { AuthController } from './auth.controller';

@Global()
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, PermissionGuard, AccessService],
  exports: [SupabaseAuthGuard, PermissionGuard, AccessService],
})
export class AuthModule {}
