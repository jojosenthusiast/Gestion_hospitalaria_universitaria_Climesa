import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * CON-01: helpers that describe response bodies in contrato/openapi.json. They only add Swagger metadata;
 * they never change what the API returns.
 */
export type PropOptions = { nullable?: boolean; optional?: boolean; description?: string };
type Base = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClassType = new (...args: any[]) => unknown;

function prop(base: Base, o: PropOptions = {}): PropertyDecorator {
  const options = { ...base, ...(o.nullable ? { nullable: true } : {}), ...(o.description ? { description: o.description } : {}) };
  return o.optional ? ApiPropertyOptional(options) : ApiProperty(options);
}

export const UuidProp = (o?: PropOptions) => prop({ type: String, format: 'uuid' }, o);
export const DateTimeProp = (o?: PropOptions) => prop({ type: String, format: 'date-time' }, o);
export const DateProp = (o?: PropOptions) => prop({ type: String, format: 'date', description: 'Día local, yyyy-MM-dd' }, o);
export const StrProp = (o?: PropOptions) => prop({ type: String }, o);
export const IntProp = (o?: PropOptions) => prop({ type: 'integer' }, o);
export const NumProp = (o?: PropOptions) => prop({ type: Number }, o);
export const BoolProp = (o?: PropOptions) => prop({ type: Boolean }, o);
/** PostgreSQL `numeric` and `bigint` columns arrive as text through node-postgres. */
export const DecimalProp = (o?: PropOptions) => prop({ type: String, description: 'Número decimal como texto (numeric de PostgreSQL)' }, o);
export const BigIntProp = (o?: PropOptions) => prop({ type: String, description: 'Entero de 64 bits como texto' }, o);
/** Free-form JSON (jsonb blobs). */
export const JsonProp = (o?: PropOptions) => prop({ type: 'object', additionalProperties: true }, o);
export const EnumProp = (values: readonly string[], enumName: string, o?: PropOptions) => prop({ enum: [...values], enumName }, o);
export const EnumArrayProp = (values: readonly string[], enumName: string, o?: PropOptions) => prop({ enum: [...values], enumName, isArray: true }, o);
export const StrArrayProp = (o?: PropOptions) => prop({ type: [String] }, o);
export const UuidArrayProp = (o?: PropOptions) => prop({ type: 'array', items: { type: 'string', format: 'uuid' } }, o);
export const ClassProp = (type: ClassType, o?: PropOptions) => prop({ type }, o);
export const ClassArrayProp = (type: ClassType, o?: PropOptions) => prop({ type: [type] }, o);

/** `{ id, version }` returned by most commands. */
export class IdVersionResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
}

/** A start/end interval. */
export class PeriodResponse {
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
}
