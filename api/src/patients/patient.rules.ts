import {validDui} from '../platform/identity.rules';
export {validDui} from '../platform/identity.rules';
import { BadRequestException } from '@nestjs/common';
export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const phonetic = (s: string) => normalize(s).replace(/qu/g,'k').replace(/ll/g,'y').replace(/ch/g,'x').replace(/h/g,'').replace(/v/g,'b').replace(/z/g,'s').replace(/c(?=[ei])/g,'s').replace(/c/g,'k');
export function recordNumber(sequence: string | number): string {
  const body = String(sequence).padStart(7,'0');
  let n = 0; for (const c of body) n = ((n+Number(c))*2)%11;
  const check = (12-n%11)%11;
  return `${body}-${check===10?'X':check}`;
}
export type Demographics = { givenNames: string; surnames: string; dui?: string | null; birth?: string | null; sex: string; phone?: string | null; email?: string | null; address?: string | null; provisional?: boolean; estimatedAge?: number; description?: string };
export function validateDemographics(data: Demographics, today: Date): Demographics {
  const name = /^[\p{L}\p{M} .’'-]+$/u;
  if (!data.provisional && (!name.test(data.givenNames) || data.givenNames.trim().length<2 || !name.test(data.surnames) || data.surnames.trim().length<2)) throw new BadRequestException('Escribe nombres y apellidos válidos, sin números.');
  if (!['femenino','masculino','indeterminado','no_registrado'].includes(data.sex)) throw new BadRequestException('Selecciona un sexo válido.');
  if (data.dui && (!/^\d{8}-?\d$/.test(data.dui) || !validDui(data.dui))) throw new BadRequestException('El DUI no tiene un dígito verificador válido.');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new BadRequestException('Revisa el correo electrónico.');
  if (data.phone && !/^[267]\d{3}-?\d{4}$/.test(data.phone)) throw new BadRequestException('El teléfono debe tener ocho dígitos.');
  if (data.birth) {
    const parsed = new Date(data.birth+'T12:00:00Z');
    const min = new Date(today); min.setUTCFullYear(min.getUTCFullYear()-120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birth) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0,10)!==data.birth || data.birth>today.toISOString().slice(0,10) || data.birth<min.toISOString().slice(0,10)) throw new BadRequestException('Revisa la fecha de nacimiento; no puede ser futura ni superar 120 años.');
  }
  if (data.provisional && (!Number.isInteger(data.estimatedAge) || data.estimatedAge!<0 || data.estimatedAge!>120 || (data.description?.trim().length ?? 0)<10)) throw new BadRequestException('Una identidad provisional necesita edad estimada y señas de al menos diez caracteres.');
  return {...data, givenNames: data.givenNames?.trim() ?? '', surnames: data.surnames?.trim() ?? '', dui: data.dui ? data.dui.replace(/-/g,'') : null, birth: data.birth || null, phone: data.phone?.replace(/-/g,'') || null};
}

export type MatchEvidence = { query: string; fullName: string; record: string; dui?: string | null; birth?: string | null };
/** FR-102-01: motivos reales por los que un paciente aparece en la búsqueda, en el orden documento, expediente, fecha, nombre o fonética. */
export function matchReasons(e: MatchEvidence): string[] {
  const query = e.query.trim();
  if (!query) return ['Listado sin criterio de búsqueda'];
  const reasons: string[] = [];
  const digits = query.replace(/\D/g,'');
  if (digits.length>=4 && (e.dui??'').replace(/\D/g,'').includes(digits)) reasons.push('Coincidencia de documento');
  if (e.record.toLowerCase().includes(query.toLowerCase())) reasons.push('Coincidencia de expediente');
  if (e.birth && e.birth===query) reasons.push('Coincidencia de fecha de nacimiento');
  const words = normalize(query).split(' ').filter(Boolean);
  const name = normalize(e.fullName);
  if (words.length && words.every(w=>name.includes(w))) reasons.push('Coincidencia de nombre');
  else if (words.length && words.every(w=>phonetic(e.fullName).includes(phonetic(w)))) reasons.push('Coincidencia fonética');
  return reasons.length ? reasons : ['Coincidencia de datos'];
}
/** FR-102-05: al editar, una fecha estimada (o aproximada) no se vuelve exacta si quien edita no la cambia. */
export function birthPrecision(previous: { birth: string | null; precision: string }, birth: string | null): string {
  if (!birth) return previous.precision==='estimada' ? 'estimada' : 'desconocida';
  return birth===previous.birth && ['estimada','anio','anio_mes'].includes(previous.precision) ? previous.precision : 'exacta';
}