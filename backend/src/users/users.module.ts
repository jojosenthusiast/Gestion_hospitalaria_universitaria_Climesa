import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [InvitationsService],
})
export class UsersModule {}
