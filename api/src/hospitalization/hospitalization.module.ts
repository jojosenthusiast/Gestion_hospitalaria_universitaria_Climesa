import { Module } from '@nestjs/common';
import { AdmissionIntakeService } from './admission-intake.service';
import { HospitalizationController } from './hospitalization.controller';
import { HospitalizationService } from './hospitalization.service';
import { TransferController } from './transfer.controller';
@Module({ controllers: [HospitalizationController, TransferController], providers: [HospitalizationService, AdmissionIntakeService] })
export class HospitalizationModule {}
