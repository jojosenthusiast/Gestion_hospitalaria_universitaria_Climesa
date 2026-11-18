import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations';
import { LabTurnaroundController, MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
@Module({ imports: [OperationsModule], controllers: [MetricsController, LabTurnaroundController], providers: [MetricsService] })
export class MetricsModule {}
