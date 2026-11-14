import { ClassProp, DateProp, DateTimeProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';
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
}

export class PendingLinkResponse {
  @UuidProp() id!: string;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
  @ClassProp(LinkAccountResponse) account!: LinkAccountResponse;
  @ClassProp(LinkDeclaredResponse) declared!: LinkDeclaredResponse;
  @ClassProp(LinkCandidateResponse, { nullable: true, description: 'Solo si un único expediente coincide' }) candidate!: LinkCandidateResponse | null;
  @IntProp({ description: 'Cuántos expedientes coinciden' }) candidates!: number;
}
