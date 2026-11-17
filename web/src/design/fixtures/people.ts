/**
 * Shared fictitious people for the design preview: one patient set that the counter (/fila, /citas, the selector) and
 * the Pacientes module read, and the staff names the other fixtures use. Every name is visibly fictitious and every
 * `fullName` is exactly `givenNames + ' ' + surnames`, so no surname pair repeats inside a name.
 */
import type { Patient } from '../../lib/api';

export const GIVEN = ['María José', 'Ana Lucía', 'José Roberto', 'Carlos Alberto', 'Rosa Elena', 'Juan Francisco', 'Karla Beatriz', 'Luis Enrique', 'Marta Alicia', 'Óscar Mauricio', 'Gabriela Alejandra', 'Fernando José', 'Claudia Marisol', 'Ricardo Antonio', 'Sofía Valentina'];
/** First surnames; each name pairs one of these with a fictitious second surname, never with itself. */
export const FIRST_SURNAME = ['Hernández', 'Martínez', 'López', 'Rodríguez', 'Flores', 'Ramírez', 'Guevara', 'Castillo', 'Rivas', 'Mejía', 'Alvarado', 'Portillo', 'Menjívar', 'Quintanilla', 'Ayala', 'de la Cruz', 'Henríquez'];
export const SECOND_SURNAME = ['Ejemplo', 'Prueba', 'Ficticio'];

/** Patient ids keep the namespace the counter fixtures always used. */
export const patientUuid = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
export const fixtureUuid = (space: string, n: number) => `00000000-0000-4000-${space}-${String(n).padStart(12, '0')}`;

export const MIN = 60_000;
export const HOUR = 3_600_000;
/** Today in El Salvador (UTC-6), as the agenda groups it. */
export const localDay = (at = Date.now()) => new Date(at - 6 * HOUR).toISOString().slice(0, 10);
export const localInstant = (day: string, hour: number, minute = 0) => new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-06:00`).toISOString();
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const ago = (minutes: number) => new Date(Date.now() - minutes * MIN).toISOString();
export const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type FixturePatient = Patient & { birth: string; dui: string };

export const PATIENT_COUNT = 330;

/** Name parts of the i-th fictitious person: unique for the first 765 indexes. */
export function personName(i: number) {
  const givenNames = GIVEN[i % GIVEN.length];
  const surnames = `${FIRST_SURNAME[Math.floor(i / GIVEN.length) % FIRST_SURNAME.length]} ${SECOND_SURNAME[(Math.floor(i / 255) + i) % SECOND_SURNAME.length]}`;
  return { givenNames, surnames, fullName: `${givenNames} ${surnames}` };
}

const FEMALE = new Set(['María José', 'Ana Lucía', 'Rosa Elena', 'Karla Beatriz', 'Marta Alicia', 'Gabriela Alejandra', 'Claudia Marisol', 'Sofía Valentina']);

export function buildPatients(count = PATIENT_COUNT): FixturePatient[] {
  return Array.from({ length: count }, (_, i) => {
    const name = personName(i);
    return {
      id: patientUuid(1000 + i), record: `${String(2000 + i).padStart(7, '0')}-${i % 10}`, ...name,
      state: i % 41 === 40 ? 'inactivo' : 'activo', active: i % 41 !== 40, sex: FEMALE.has(name.givenNames) ? 'femenino' : 'masculino',
      birth: `${1950 + (i % 60)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
      dui: `0${String(4000000 + i * 37).slice(0, 7)}-${i % 10}`, phone: `7${String(100 + (i % 900)).padStart(3, '0')}-${String(1000 + i).slice(-4)}`,
      email: i % 4 === 0 ? `${fold(name.givenNames.split(' ')[0])}.${fold(name.surnames.split(' ')[0]).replace(/ /g, '')}${i}@example.test` : null,
      address: i % 3 === 0 ? `Colonia Ejemplo, pasaje ${1 + (i % 20)}, casa ${10 + i}, San Salvador` : null,
      version: 1, history: [],
    };
  });
}

/** Staff names reused by lab, ambulance and hospital fixtures (fictitious, never patients). */
export const STAFF = {
  doctors: ['Ana Isabel Ejemplo López', 'Roberto Carlos Prueba Mejía', 'Patricia Elena Ficticio Rivas', 'Miguel Ángel Ejemplo Guevara', 'Lorena Beatriz Prueba Castillo', 'Héctor Manuel Ficticio Alvarado'],
  nurses: ['Luis Fernando Prueba Rivas', 'Daniela Sofía Ejemplo Ayala', 'Karen Michelle Ficticio Portillo'],
  lab: ['Elena Prueba Martínez', 'Jorge Alberto Ejemplo Menjívar'],
  paramedics: ['Kevin Alexander Prueba Ramos', 'Diana Carolina Ejemplo Henríquez'],
  drivers: ['Mario Ejemplo Flores', 'Walter Ernesto Prueba Quintanilla'],
};
