import { ClassProp, DateTimeProp, EnumProp, StrProp } from '../platform/responses';

export class HealthIntegrationsResponse {
  @EnumProp(['configured', 'not_configured'], 'EstadoIntegracion') supabase!: string;
}

export class HealthResponse {
  @EnumProp(['ok'], 'EstadoSalud') status!: string;
  @StrProp() service!: string;
  @DateTimeProp() timestamp!: string;
  @ClassProp(HealthIntegrationsResponse) integrations!: HealthIntegrationsResponse;
}

export class ReadinessResponse {
  @EnumProp(['ok'], 'EstadoSalud') status!: string;
  @EnumProp(['ok'], 'EstadoSalud') database!: string;
  @DateTimeProp() timestamp!: string;
}
