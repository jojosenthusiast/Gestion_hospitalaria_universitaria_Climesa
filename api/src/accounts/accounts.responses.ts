import { BoolProp, ClassProp, DateProp, DateTimeProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_VINCULACION } from '../platform/states';

export class LinkRequestResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_VINCULACION, 'EstadoVinculacion') state!: string;
  @DateTimeProp() createdAt!: string;
  @DateTimeProp({ nullable: true }) resolvedAt!: string | null;
  @StrProp({ nullable: true }) rejectionReason!: string | null;
  @IntProp() version!: number;
}

export class LinkAccountResponse {
  @StrProp() email!: string;
  @StrProp({ nullable: true }) name!: string | null;
}

export class LinkDeclaredResponse {
  @StrProp({ description: 'DUI declarado con guion' }) dui!: string;
  @DateProp({ nullable: true }) birth!: string | null;
}

export class LinkCandidateResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp({ nullable: true }) fullName!: string | null;
  @DateProp({ nullable: true }) birth!: string | null;
  @StrProp({ nullable: true, description: 'DUI del expediente con guion (G-2), para compararlo con el declarado' }) dui!: string | null;
  @BoolProp({ optional: true, description: 'Siempre true: candidate solo es la coincidencia exacta de DUI y nacimiento' }) exact?: boolean;
}

/** G-2: the closest record when nothing matches exactly (same birth, DUI one digit away). Never approvable. */
export class LinkClosestResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp({ nullable: true }) fullName!: string | null;
  @DateProp({ nullable: true }) birth!: string | null;
  @StrProp({ nullable: true, description: 'DUI del expediente con guion' }) dui!: string | null;
}

export class PendingLinkResponse {
  @UuidProp() id!: string;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
  @ClassProp(LinkAccountResponse) account!: LinkAccountResponse;
  @ClassProp(LinkDeclaredResponse) declared!: LinkDeclaredResponse;
  @ClassProp(LinkCandidateResponse, { nullable: true, description: 'Solo si un único expediente coincide' }) candidate!: LinkCandidateResponse | null;
  @IntProp({ description: 'Cuántos expedientes coinciden' }) candidates!: number;
  @ClassProp(LinkClosestResponse, { optional: true, nullable: true, description: 'Sin coincidencia exacta: el expediente más parecido (mismo nacimiento, DUI distinto en un dígito). No se puede aprobar.' }) closest?: LinkClosestResponse | null;
}

/** The account's automatic link state (owner observations 2026-11-18, batch 2). */
export class MyLinkResponse {
  @BoolProp({ description: 'La cuenta ya está unida a su expediente' }) linked!: boolean;
  @StrProp({ nullable: true, description: 'Correo de la cuenta. Sin vincular, la app pide: «Pide en Recepción que anoten este correo: <email>»' }) email!: string | null;
  @BoolProp({ description: 'Supabase Auth confirmó el correo. Solo un correo confirmado une la cuenta con el expediente.' }) emailVerified!: boolean;
  @ClassProp(LinkRequestResponse, { nullable: true, description: 'Obsoleto: siempre null. Ya no hay solicitudes de vinculación.' }) request!: LinkRequestResponse | null;
}
