import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CommandService } from './command.service';
import { PolicyRegistry } from './policy.registry';
import { Clock } from './clock';
import { AuditService } from './audit.service';
@Global()
@Module({ providers: [DatabaseService, CommandService, Clock, PolicyRegistry, AuditService], exports: [DatabaseService, CommandService, Clock, PolicyRegistry, AuditService] })
export class PlatformModule {}
