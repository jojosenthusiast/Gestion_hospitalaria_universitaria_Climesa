import { EnumProp, IntProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_USUARIO } from '../platform/states';

export class UserAccountResponse {
  @UuidProp() id!: string;
  @StrProp() email!: string;
  @StrProp({ nullable: true }) name!: string | null;
  @EnumProp(ESTADO_USUARIO, 'EstadoUsuario') state!: string;
  @IntProp() version!: number;
  @UuidProp({ nullable: true }) staffId!: string | null;
  @StrArrayProp({ description: 'Códigos de rol' }) roles!: string[];
}

export class InvitationResponse {
  @UuidProp() userId!: string;
  @StrProp() email!: string;
  @StrArrayProp() roles!: string[];
  @StrProp({ description: 'Primer rol de la invitación' }) role!: string;
  @EnumProp(['sent'], 'EstadoEnvioInvitacion') status!: string;
}

export class UserStateResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_USUARIO, 'EstadoUsuario') state!: string;
}
