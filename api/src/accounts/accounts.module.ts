import { Module } from '@nestjs/common';
import { AccountLinkingController, MyLinkController } from './account-linking.controller';
import { AccountLinkingService } from './account-linking.service';

@Module({ controllers: [AccountLinkingController, MyLinkController], providers: [AccountLinkingService] })
export class AccountsModule {}
