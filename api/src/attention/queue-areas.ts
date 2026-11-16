/**
 * Area codes of the queue (docs/diseno/fase2/02-sistema.md §1). They are AREA codes, not role codes: `LAB` and `REC`
 * only share their spelling with the Laboratory and Reception roles, and nothing here decides authorization.
 */
export const AREA_FILA = ['CON', 'EMG', 'LAB', 'REC', 'GEN'] as const;

/** Area code of each queue service: the number counts from 1 per area and day and is shown next to this code. */
export const QUEUE_AREA: Record<string, typeof AREA_FILA[number]> = { consulta_general: 'CON', emergencia: 'EMG', laboratorio: 'LAB', admisiones: 'REC' };
