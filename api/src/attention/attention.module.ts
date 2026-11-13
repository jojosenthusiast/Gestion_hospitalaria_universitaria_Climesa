import { Module } from '@nestjs/common';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';

@Module({ controllers: [AttentionController, ConsultationController], providers: [AttentionService, ConsultationService] })
export class AttentionModule {}
