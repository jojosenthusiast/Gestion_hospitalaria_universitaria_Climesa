import { EnumArrayProp, EnumProp, IntProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';
import { ACCOUNT_ACTIONS } from './users.rules';
import { ESTADO_USUARIO } from '../platform/states';

export class UserAccountResponse {
  @UuidProp() id!: string;
  @StrProp() email!: string;
  @StrProp({ nullable: true }) name!: string | null;
  @EnumProp(ESTADO_USUARIO, 'EstadoUsuario') state!: string;
  @IntProp() version!: number;
  @UuidProp({ nullable: true }) staffId!: string | null;
  @StrArrayProp({ description: 'Códigos de rol' }) roles!: string[];
  @EnumProp(['enviada', 'aceptada', 'rechazada', 'expirada', 'cancelada'], 'EstadoInvitacion', { nullable: true, description: 'Última invitación; null si la cuenta nació por registro en la app' }) invitationState!: string | null;
  @EnumArrayProp(ACCOUNT_ACTIONS, 'AccionCuenta', { description: 'Acciones que quien consulta puede hacer sobre esta cuenta (jerarquía, autogestión e invitación)' }) allowedActions!: string[];
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
