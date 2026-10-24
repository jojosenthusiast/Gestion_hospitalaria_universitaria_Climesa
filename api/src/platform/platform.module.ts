import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CommandService } from './command.service';
import { PolicyRegistry } from './policy.registry';
import { Clock } from './clock';
@Global()
@Module({ providers: [DatabaseService, CommandService, Clock, PolicyRegistry], exports: [DatabaseService, CommandService, Clock, PolicyRegistry] })
export class PlatformModule {}
