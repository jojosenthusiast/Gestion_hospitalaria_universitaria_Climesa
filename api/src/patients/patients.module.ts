import { Module } from '@nestjs/common';
import { MePatientController } from './me-patient.controller';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  controllers: [PatientsController, MePatientController],
  providers: [PatientsService],
})
export class PatientsModule {}
