import { Module } from '@nestjs/common';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { ClinicalRecordController } from './clinical-record.controller';
import { ClinicalRecordService } from './clinical-record.service';
import { ClinicalHistoryController } from './clinical-history.controller';
import { ClinicalHistoryService } from './clinical-history.service';

@Module({ controllers: [AttentionController, ConsultationController, QueueController, ClinicalRecordController, ClinicalHistoryController], providers: [AttentionService, ConsultationService, QueueService, ClinicalRecordService, ClinicalHistoryService] })
export class AttentionModule {}

