import { Module } from '@nestjs/common';
import { MyNoticesController, NoticesController, PublicController } from './public.controller';
import { PublicRateLimitGuard } from './rate-limit.guard';
import { PublicService } from './public.service';
@Module({ controllers: [PublicController, NoticesController, MyNoticesController], providers: [PublicService, PublicRateLimitGuard] })
export class PublicModule {}
