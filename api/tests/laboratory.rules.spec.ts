import { LabMark } from '../src/laboratory/laboratory.dto';
import { appointmentMatchesProposal, classifyLabValue, followUpReason, labExternalActions, matchesDoubleIdentification } from '../src/laboratory/laboratory.rules';

describe('clasificación de resultados de laboratorio', () => {
  const range = { minimo: '3.5', maximo: '5.0', critico_bajo: '2.5', critico_alto: '6.0' };
  it.each([
    [2.4, LabMark.CRITICAL_LOW], [2.6, LabMark.LOW], [3.5, LabMark.NORMAL],
    [5.0, LabMark.NORMAL], [5.1, LabMark.HIGH], [6.1, LabMark.CRITICAL_HIGH],
  ])('clasifica %s como %s', (value, expected) => expect(classifyLabValue(value, range)).toBe(expected));
  it('no inventa marcas sin un rango vigente o valor numérico', () => {
    expect(classifyLabValue(6.8)).toBe(LabMark.NO_RANGE);
    expect(classifyLabValue(undefined, range)).toBe(LabMark.NO_RANGE);
  });
});

describe('doble identificación de paciente', () => {
  const identity = { expediente: 'EXP-001', fullName: 'Ana María López Cruz' };
  it('acepta expediente y nombre completos coincidentes', () => {
    expect(matchesDoubleIdentification(identity, 'EXP-001', 'Ana María López Cruz')).toBe(true);
  });
  it('tolera mayúsculas y espacios adicionales en el nombre', () => {
    expect(matchesDoubleIdentification(identity, 'EXP-001', '  ANA   MARÍA LÓPEZ CRUZ ')).toBe(true);
  });
  it('rechaza cualquier dato que no coincida', () => {
    expect(matchesDoubleIdentification(identity, 'EXP-009', 'Ana María López Cruz')).toBe(false);
    expect(matchesDoubleIdentification(identity, 'EXP-001', 'Ana María López')).toBe(false);
  });
});

describe('S10 reglas de seguimiento', () => {
  const can = { process: false, validate: false, review: false, cancelAny: false, cancelOwn: false, order: false };
  it('un valor crítico abre pendiente aunque no haya observación; lo crítico gana', () => {
    expect(followUpReason('critico_alto', false)).toBe('critico');
    expect(followUpReason('critico_bajo', true)).toBe('critico');
  });
  it('una observación relevante abre pendiente; un valor fuera de rango sin observación no', () => {
    expect(followUpReason('normal', true)).toBe('observacion');
    expect(followUpReason('alto', false)).toBeNull();
  });
  it('enviar a externo: laboratorio o el médico que pidió, solo pendiente', () => {
    expect(labExternalActions({ state: 'pendiente', external: false, own: false, reviewer: false }, { ...can, process: true })).toEqual(['enviar_externo']);
    expect(labExternalActions({ state: 'pendiente', external: false, own: true, reviewer: true }, { ...can, order: true })).toEqual(['enviar_externo']);
    expect(labExternalActions({ state: 'pendiente', external: false, own: false, reviewer: true }, { ...can, order: true })).toEqual([]);
    expect(labExternalActions({ state: 'en_proceso', external: false, own: true, reviewer: true }, { ...can, process: true })).toEqual([]);
  });
  it('cargar externo: laboratorio o un médico revisor, solo orden externa pendiente', () => {
    expect(labExternalActions({ state: 'pendiente', external: true, own: false, reviewer: false }, { ...can, process: true })).toEqual(['cargar_externo']);
    expect(labExternalActions({ state: 'pendiente', external: true, own: true, reviewer: true }, { ...can, review: true })).toEqual(['cargar_externo']);
    expect(labExternalActions({ state: 'pendiente', external: true, own: true, reviewer: false }, { ...can, order: true })).toEqual([]);
  });
  it('la cita confirma la propuesta solo si es del mismo paciente y médico y sigue activa', () => {
    const proposal = { patientId: 'p', doctorId: 'd' };
    expect(appointmentMatchesProposal({ patientId: 'p', doctorId: 'd', state: 'confirmada' }, proposal)).toBe(true);
    expect(appointmentMatchesProposal({ patientId: 'x', doctorId: 'd', state: 'confirmada' }, proposal)).toBe(false);
    expect(appointmentMatchesProposal({ patientId: 'p', doctorId: 'x', state: 'confirmada' }, proposal)).toBe(false);
    expect(appointmentMatchesProposal({ patientId: 'p', doctorId: 'd', state: 'cancelada' }, proposal)).toBe(false);
  });
});
