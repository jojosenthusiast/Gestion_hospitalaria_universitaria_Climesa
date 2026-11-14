import { Module } from '@nestjs/common';
import { AccountLinkingController } from './account-linking.controller';
import { AccountLinkingService } from './account-linking.service';

@Module({ controllers: [AccountLinkingController], providers: [AccountLinkingService] })
export class AccountsModule {}
