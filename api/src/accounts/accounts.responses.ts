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
  @BoolProp({ description: 'true si DUI y nacimiento coinciden con lo declarado; false si es el expediente más parecido (mismo nacimiento, DUI distinto en un dígito) y no se puede aprobar' }) exact!: boolean;
}

export class PendingLinkResponse {
  @UuidProp() id!: string;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
  @ClassProp(LinkAccountResponse) account!: LinkAccountResponse;
  @ClassProp(LinkDeclaredResponse) declared!: LinkDeclaredResponse;
  @ClassProp(LinkCandidateResponse, { nullable: true, description: 'El único expediente que coincide o, sin coincidencia, el más parecido (exact=false)' }) candidate!: LinkCandidateResponse | null;
  @IntProp({ description: 'Cuántos expedientes coinciden' }) candidates!: number;
}

/** G-1: the account's link state. */
export class MyLinkResponse {
  @BoolProp({ description: 'La cuenta ya está vinculada a un expediente' }) linked!: boolean;
  @ClassProp(LinkRequestResponse, { nullable: true, description: 'Última solicitud de vinculación; null si nunca pidió' }) request!: LinkRequestResponse | null;
}
