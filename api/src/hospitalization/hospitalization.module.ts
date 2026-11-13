import { Module } from '@nestjs/common';
import { HospitalizationController } from './hospitalization.controller';
import { HospitalizationService } from './hospitalization.service';
import { TransferController } from './transfer.controller';
@Module({ controllers: [HospitalizationController, TransferController], providers: [HospitalizationService] })
export class HospitalizationModule {}
