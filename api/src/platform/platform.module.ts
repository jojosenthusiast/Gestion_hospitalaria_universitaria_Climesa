import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CommandService } from './command.service';
import { PolicyRegistry } from './policy.registry';
import { Clock } from './clock';
import { AuditService } from './audit.service';
import { ClinicalFileStorage } from './clinical-storage';
import { SupabaseClinicalFileStorage } from './supabase-clinical-storage';
import { MultipartSetup } from './multipart';
@Global()
@Module({
  providers: [DatabaseService, CommandService, Clock, PolicyRegistry, AuditService, MultipartSetup, { provide: ClinicalFileStorage, useClass: SupabaseClinicalFileStorage }],
  exports: [DatabaseService, CommandService, Clock, PolicyRegistry, AuditService, ClinicalFileStorage],
})
export class PlatformModule {}
