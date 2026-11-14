import { Module } from '@nestjs/common';
import { NoticesController, PublicController } from './public.controller';
import { PublicRateLimitGuard } from './rate-limit.guard';
import { PublicService } from './public.service';
@Module({ controllers: [PublicController, NoticesController], providers: [PublicService, PublicRateLimitGuard] })
export class PublicModule {}
