import { Injectable } from '@nestjs/common';

/** FR-100-16: las fechas locales usan una zona fija; El Salvador es UTC-6 todo el año, sin horario de verano. */
export const BUSINESS_ZONE = 'America/El_Salvador';
const OFFSET_MS = -6 * 3600_000;
const DAY_MS = 86400_000;

/** Fecha local `yyyy-MM-dd` del instante dado. */
export const businessDate = (at: Date): string => new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
/** Intervalo `[start, end)` en UTC del día local `yyyy-MM-dd`. */
export const businessDayRange = (date: string): { start: Date; end: Date } => {
  const local = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(local.getTime()) || local.toISOString().slice(0, 10) !== date) throw new RangeError(`Fecha local inválida: ${date}`);
  const start = new Date(local.getTime() - OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
};

@Injectable()
export class Clock {
  now(): Date { return new Date(); }
  /** Fecha local de hoy según `now()`, de modo que una prueba que sustituya `now()` controle también el día. */
  today(): string { return businessDate(this.now()); }
}
