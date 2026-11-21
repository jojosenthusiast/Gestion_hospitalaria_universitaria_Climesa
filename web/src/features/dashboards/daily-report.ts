import { exportName, type ExportCell, type ExportTable } from '../../lib/export';
import { roleNames } from '../../lib/api';
import { formatDateTime, formatTime as timeLabel } from '../../lib/format';
import { stateNames as unitStateNames } from '../ambulance/types';
import { boardGaps, type MetricsBoard } from '../tablero';

const floorName = (floor: number | null) => floor == null ? 'Sin planta' : `Planta ${floor}`;

/**
 * P3 S6: «Reporte del día» for Administración and Jefatura de Operaciones, built only from `GET /metricas/tablero`
 * (aggregates, no personal data): beds by state and floor, queue, lab, ambulance, coverage gaps and shifts.
 */
export function dailyReport(t: MetricsBoard, now = new Date()): ExportTable {
  const rows: ExportCell[][] = [
    ['Camas', 'Total', t.camas.total], ['Camas', 'Libres', t.camas.libres], ['Camas', 'Ocupadas', t.camas.ocupadas],
    ['Camas', 'Reservadas', t.camas.reservadas], ['Camas', 'En limpieza', t.camas.limpieza], ['Camas', 'Bloqueadas', t.camas.bloqueadas],
    ...t.ocupacionPorPlanta.map(p => ['Camas por planta', floorName(p.planta), `${p.libres} libres de ${p.camas} · ${p.ocupadas} ocupadas · ${p.reservadas} reservadas · ${p.limpieza} en limpieza · ${p.bloqueadas} bloqueadas`]),
    ['Fila', 'Números emitidos', t.fila.emitidos], ['Fila', 'En espera', t.fila.enEspera], ['Fila', 'Llamados', t.fila.llamados],
    ['Fila', 'En atención', t.fila.enAtencion], ['Fila', 'Atendidos', t.fila.atendidos], ['Fila', 'No se presentó', t.fila.noSePresento],
    ['Laboratorio', 'Pendientes', t.laboratorio.pendiente], ['Laboratorio', 'En Proceso', t.laboratorio.enProceso],
    ['Laboratorio', 'Completadas hoy', t.laboratorio.completadoHoy], ['Laboratorio', 'Canceladas hoy', t.laboratorio.canceladoHoy],
    ['Ambulancia', 'Estado', t.ambulancia ? unitStateNames[t.ambulancia.estado] ?? t.ambulancia.estado : 'Sin unidad registrada'],
    ...(t.ambulancia ? [['Ambulancia', 'Paramédico de turno', t.ambulancia.paramedicoDeTurno ? 'Sí' : 'No']] : []),
    ['Cobertura de turnos', 'Huecos de hoy', t.cobertura.huecos],
    ...boardGaps(t.cobertura).map(g => ['Cobertura de turnos', `${g.area} · ${roleNames[g.role] ?? g.role}`, `${timeLabel(g.start)}–${timeLabel(g.end)} · ${g.actual} de ${g.required}`]),
    ['Turnos', 'En curso ahora', t.turnosEnCurso],
    ['Pacientes', 'Activos', t.pacientesActivos],
  ];
  return { filename: exportName('reporte-del-dia', now), title: 'Reporte del día', subtitle: `Datos del tablero, actualizados el ${formatDateTime(t.actualizadoEn)}`, columns: ['Sección', 'Indicador', 'Valor'], rows };
}
