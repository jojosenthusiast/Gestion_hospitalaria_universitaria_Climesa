import { Module } from '@nestjs/common';
import { AmbulanceController } from './ambulance.controller';
import { AmbulanceService } from './ambulance.service';
@Module({controllers:[AmbulanceController],providers:[AmbulanceService]})
export class AmbulanceModule {}
