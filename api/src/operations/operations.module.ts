import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { PersonnelService } from './personnel.service';
import { InfrastructureService } from './infrastructure.service';
@Module({controllers:[OperationsController],providers:[PersonnelService,InfrastructureService]})
export class OperationsModule {}
