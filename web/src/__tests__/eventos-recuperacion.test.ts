import { describe, expect, it } from 'vitest';
import { catchUpEvents } from '../lib/live';

// tiempo-real.md: `GET /eventos` carries `tipo` and `entidad`; `type` / `entity` are deprecated aliases.
describe('recuperación de eventos tras una caída', () => {
  it('lee tipo y entidad, y solo usa los alias obsoletos como respaldo', () => {
    expect(catchUpEvents([
      { tipo: 'usuario.actualizado', entidad: 'usuario', type: 'viejo', entity: 'viejo', id: 'u1' },
      { type: 'cita.actualizada', entity: 'cita', id: 'c1' },
    ])).toEqual([
      { tipo: 'usuario.actualizado', entidad: 'usuario', id: 'u1' },
      { tipo: 'cita.actualizada', entidad: 'cita', id: 'c1' },
    ]);
    expect(catchUpEvents(undefined)).toEqual([]);
  });
});
