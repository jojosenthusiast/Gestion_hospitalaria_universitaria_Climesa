import { BoolProp, ClassArrayProp, ClassProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';

export class SessionUserResponse {
  @UuidProp() id!: string;
  @StrProp({ optional: true }) email?: string;
}

export class PermissionGrantResponse {
  @StrProp({ description: 'Código del permiso, por ejemplo citas.ver' }) code!: string;
  @StrProp({ description: 'Contexto del permiso (x, propio, relacion, area, ...)' }) context!: string;
}

export class SessionProfileResponse {
  @ClassProp(SessionUserResponse) user!: SessionUserResponse;
  @UuidProp() id!: string;
  @StrProp() email!: string;
  @StrProp({ nullable: true }) name!: string | null;
  @StrArrayProp({ description: 'Códigos de rol' }) roles!: string[];
  @StrArrayProp({ description: 'Plataformas permitidas en minúscula' }) platforms!: string[];
  @ClassArrayProp(PermissionGrantResponse) permissions!: PermissionGrantResponse[];
  @StrArrayProp({ description: 'Canales de tiempo real autorizados' }) channels!: string[];
  @UuidProp({ nullable: true }) patientId!: string | null;
  @UuidProp({ nullable: true }) staffId!: string | null;
  @BoolProp() canInviteAdmin!: boolean;
}
