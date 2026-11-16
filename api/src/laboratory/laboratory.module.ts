import { Module } from '@nestjs/common';
import { LabCatalogController } from './lab-catalog.controller';
import { LabCatalogService } from './lab-catalog.service';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryService } from './laboratory.service';
import { MeLaboratoryController } from './me-laboratory.controller';

@Module({ controllers: [LaboratoryController, MeLaboratoryController, LabCatalogController], providers: [LaboratoryService, LabCatalogService] })
export class LaboratoryModule {}
