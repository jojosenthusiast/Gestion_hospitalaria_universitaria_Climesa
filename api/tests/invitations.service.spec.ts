import { ForbiddenException } from '@nestjs/common';
import { InvitationsService } from '../src/users/invitations.service';
import { Actor } from '../src/platform/actor';
describe('InvitationsService — protecciones previas al proveedor',()=>{
 test('no permite que una invitación asigne roles a la propia cuenta',async()=>{
  const run=jest.fn();const service=new InvitationsService({} as never,{} as never,{} as never,{run} as never);
  const actor={id:'00000000-0000-4000-8000-000000000001',email:'admin@example.test'} as Actor;
  await expect(service.invitePatient({email:'ADMIN@example.test',displayName:'Administrador',roles:['ADM']},actor,'clave-123')).rejects.toThrow(ForbiddenException);
  expect(run).not.toHaveBeenCalled();
 });
});
