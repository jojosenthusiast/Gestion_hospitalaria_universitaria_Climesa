import { LabMark } from '../src/laboratory/laboratory.dto';
import { classifyLabValue, matchesDoubleIdentification } from '../src/laboratory/laboratory.rules';

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
