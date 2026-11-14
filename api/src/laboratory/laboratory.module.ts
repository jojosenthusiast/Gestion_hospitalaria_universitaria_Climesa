import { Module } from '@nestjs/common';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryService } from './laboratory.service';
import { MeLaboratoryController } from './me-laboratory.controller';

@Module({ controllers: [LaboratoryController, MeLaboratoryController], providers: [LaboratoryService] })
export class LaboratoryModule {}
