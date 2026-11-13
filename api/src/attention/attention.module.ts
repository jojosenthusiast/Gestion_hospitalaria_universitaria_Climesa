import { Module } from '@nestjs/common';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({ controllers: [AttentionController, ConsultationController, QueueController], providers: [AttentionService, ConsultationService, QueueService] })
export class AttentionModule {}

