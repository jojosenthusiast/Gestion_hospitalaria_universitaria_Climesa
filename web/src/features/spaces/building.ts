import type { Bed, Space } from '../../lib/api';

/** Estados de cama con su explicación; el color nunca va solo: cada estado tiene también forma y palabra (diseño 04). */
export const BED_STATES = [
  { key: 'libre', label: 'Libre', hint: 'Disponible para asignar' },
  { key: 'ocupada', label: 'Ocupada', hint: 'Tiene un paciente' },
  { key: 'reservada', label: 'Reservada', hint: 'Apartada para una admisión' },
  { key: 'limpieza', label: 'En limpieza', hint: 'Se limpia o falta verificarla' },
  { key: 'bloqueada', label: 'Bloqueada', hint: 'Fuera de servicio, con motivo' },
] as const;
export type BedStateKey = (typeof BED_STATES)[number]['key'];
export const stateLabel = (state: string) => BED_STATES.find(s => s.key === state)?.label ?? state;

export const spaceTypeNames: Record<string, string> = { hospital: 'Hospital', planta: 'Planta', area: 'Área', habitacion: 'Habitación', cama: 'Cama', consultorio: 'Consultorio', cubiculo: 'Cubículo', bodega: 'Bodega', bahia: 'Bahía' };
export const categoryName = (category?: string | null) => (category === 'vip' ? 'VIP' : category === 'semiprivada' ? 'Semiprivada' : '');

export type SpaceNode = { space: Space; children: SpaceNode[] };
export type Floor = { id: string; label: string; level: number | null; node: SpaceNode | null; children: SpaceNode[] };

const byCode = (a: SpaceNode, b: SpaceNode) => a.space.code.localeCompare(b.space.code, 'es', { numeric: true });

/** Árbol de espacios por `parentId`; los nodos cuyo padre no llegó (permisos o datos parciales) quedan como raíces. */
export function buildTree(spaces: Space[]): SpaceNode[] {
  const nodes = new Map(spaces.map(space => [space.id, { space, children: [] as SpaceNode[] }]));
  const roots: SpaceNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.space.parentId ? nodes.get(node.space.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  for (const node of nodes.values()) node.children.sort(byCode);
  return roots.sort(byCode);
}

/** Plantas tomadas de los datos (tipo `planta`), no fijas; lo que no cuelga de una planta va en "Sin planta". */
export function floorsOf(spaces: Space[]): Floor[] {
  const floors: Floor[] = [], loose: SpaceNode[] = [];
  const walk = (node: SpaceNode, insideFloor: boolean) => {
    if (node.space.type === 'planta') { floors.push({ id: node.space.id, label: node.space.name || `Planta ${node.space.level ?? ''}`.trim(), level: node.space.level ?? null, node, children: node.children }); return; }
    if (node.space.type === 'hospital') { node.children.forEach(child => walk(child, false)); return; }
    if (!insideFloor) loose.push(node);
  };
  buildTree(spaces).forEach(root => walk(root, false));
  floors.sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.label.localeCompare(b.label, 'es', { numeric: true }));
  if (loose.length) floors.push({ id: 'sin-planta', label: 'Sin planta', level: null, node: null, children: loose });
  return floors;
}

/** Camas activas bajo un nodo (o el propio nodo si es una cama). */
export function bedsOf(node: SpaceNode): Space[] {
  if (node.space.type === 'cama') return node.space.active ? [node.space] : [];
  return node.children.flatMap(bedsOf);
}

export type Counts = { total: number; byState: Record<BedStateKey, number>; unknown: number };
export function countBeds(beds: Space[], states: Map<string, Bed> | null): Counts {
  const byState = { libre: 0, ocupada: 0, reservada: 0, limpieza: 0, bloqueada: 0 } as Record<BedStateKey, number>;
  let unknown = 0;
  for (const bed of beds) {
    const state = states?.get(bed.id)?.state as BedStateKey | undefined;
    if (state && state in byState) byState[state]++; else unknown++;
  }
  return { total: beds.length, byState, unknown };
}

/** Texto sin acentos ni mayúsculas para buscar ("habitacion" encuentra "Habitación"). */
export const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

/**
 * Estructura sintética para quien solo puede leer el tablero de camas (`camas.ver_tablero` sin `espacios.ver`):
 * una planta por nivel, una habitación por `roomId` y una cama por fila.
 */
export function spacesFromBeds(beds: Bed[]): Space[] {
  const result: Space[] = [], levels = [...new Set(beds.map(b => b.level))].sort((a, b) => a - b), rooms = new Map<string, Bed[]>();
  for (const bed of beds) rooms.set(bed.roomId, [...(rooms.get(bed.roomId) ?? []), bed]);
  const base = { active: true, version: 1, path: '' };
  for (const level of levels) {
    const onFloor = beds.filter(b => b.level === level);
    result.push({ ...base, id: `planta-${level}`, parentId: null, type: 'planta', code: `P${level}`, name: `Planta ${level}`, level, totalBeds: onFloor.length, freeBeds: onFloor.filter(b => b.state === 'libre').length });
  }
  for (const [roomId, list] of rooms) {
    const first = list[0];
    result.push({ ...base, id: roomId, parentId: `planta-${first.level}`, type: 'habitacion', code: first.room, name: first.room, category: first.category, capacity: list.length, level: first.level, totalBeds: list.length, freeBeds: list.filter(b => b.state === 'libre').length });
    for (const bed of list) result.push({ ...base, id: bed.id, parentId: roomId, type: 'cama', code: bed.code, name: bed.code, level: bed.level, version: bed.version, path: bed.path, totalBeds: 1, freeBeds: bed.state === 'libre' ? 1 : 0 });
  }
  return result;
}
