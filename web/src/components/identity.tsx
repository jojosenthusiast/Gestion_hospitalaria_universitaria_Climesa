import type { ReactNode } from 'react';
import './identity.css';

/**
 * Identidad compartida (obs. de la ronda 2): cada rol y cada tipo de área tiene un icono y un color que se usan igual
 * en chips, listas y calendarios. El color nunca va solo: el chip siempre lleva icono y texto (o, en modo compacto,
 * un nombre accesible). Los mismos códigos, iconos y tonos viven en Android (`ui/components/Identity.kt`).
 */
export type RoleCode = 'ADM' | 'DPD' | 'JOP' | 'REC' | 'AST' | 'ENF' | 'MED' | 'LAB' | 'PAR' | 'PAC';
export type IdentityTone = 'indigo' | 'teal' | 'blue' | 'orange' | 'green' | 'magenta' | 'cyan' | 'purple' | 'red' | 'slate' | 'amber';
export type IdentityIcon =
  | 'shield' | 'lock' | 'clipboard' | 'desk' | 'hand' | 'heart' | 'steth' | 'flask' | 'ambulance' | 'user'
  | 'alert' | 'building' | 'layers' | 'door' | 'bed' | 'box' | 'bay' | 'scalpel' | 'pill' | 'calendar' | 'cube';
export type Identity = { key: string; label: string; icon: IdentityIcon; tone: IdentityTone };

export const ROLE_CODES: RoleCode[] = ['ADM', 'DPD', 'JOP', 'REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR', 'PAC'];

const ROLES: Record<RoleCode, Identity> = {
  ADM: { key: 'ADM', label: 'Administración', icon: 'shield', tone: 'indigo' },
  DPD: { key: 'DPD', label: 'Protección de datos', icon: 'lock', tone: 'teal' },
  JOP: { key: 'JOP', label: 'Jefatura de operaciones', icon: 'clipboard', tone: 'blue' },
  REC: { key: 'REC', label: 'Recepción', icon: 'desk', tone: 'orange' },
  AST: { key: 'AST', label: 'Asistencia', icon: 'hand', tone: 'green' },
  ENF: { key: 'ENF', label: 'Enfermería', icon: 'heart', tone: 'magenta' },
  MED: { key: 'MED', label: 'Medicina', icon: 'steth', tone: 'cyan' },
  LAB: { key: 'LAB', label: 'Laboratorio', icon: 'flask', tone: 'purple' },
  PAR: { key: 'PAR', label: 'Paramedicina', icon: 'ambulance', tone: 'red' },
  PAC: { key: 'PAC', label: 'Paciente', icon: 'user', tone: 'slate' },
};

/** Tipo de personal de la API (`medico`, `enfermero`...) al código de rol con el que se identifica. */
const STAFF_ROLE: Record<string, RoleCode> = {
  medico: 'MED', enfermero: 'ENF', asistente: 'AST', recepcionista: 'REC', laboratorista: 'LAB', paramedico: 'PAR',
  administrativo: 'ADM', motorista: 'PAR',
};
const STAFF_LABEL: Record<string, string> = { medico: 'Médico', enfermero: 'Enfermería', asistente: 'Asistencia', recepcionista: 'Recepción', laboratorista: 'Laboratorio', paramedico: 'Paramédico', motorista: 'Motorista', limpieza: 'Limpieza', administrativo: 'Administración', otro: 'Otro' };
const NEUTRAL: Identity = { key: 'otro', label: 'Otro', icon: 'user', tone: 'slate' };

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Acepta el código de rol (`MED`) o el tipo de personal de la API (`medico`). Un valor desconocido recibe la identidad neutra. */
export function roleIdentity(code: string | null | undefined): Identity {
  const text = (code ?? '').trim();
  if (text.toUpperCase() in ROLES) return ROLES[text.toUpperCase() as RoleCode];
  const role = STAFF_ROLE[fold(text)];
  if (role) return { ...ROLES[role], label: STAFF_LABEL[fold(text)] ?? ROLES[role].label };
  if (fold(text) in STAFF_LABEL) return { ...NEUTRAL, key: fold(text), label: STAFF_LABEL[fold(text)] };
  return text ? { ...NEUTRAL, key: fold(text), label: text } : NEUTRAL;
}

const AREA_TYPES: Record<string, Identity> = {
  hospital: { key: 'hospital', label: 'Hospital', icon: 'building', tone: 'blue' },
  planta: { key: 'planta', label: 'Planta', icon: 'layers', tone: 'indigo' },
  area: { key: 'area', label: 'Área', icon: 'cube', tone: 'teal' },
  habitacion: { key: 'habitacion', label: 'Habitación', icon: 'bed', tone: 'cyan' },
  cama: { key: 'cama', label: 'Cama', icon: 'bed', tone: 'cyan' },
  consultorio: { key: 'consultorio', label: 'Consultorio', icon: 'steth', tone: 'green' },
  cubiculo: { key: 'cubiculo', label: 'Cubículo', icon: 'door', tone: 'slate' },
  bodega: { key: 'bodega', label: 'Bodega', icon: 'box', tone: 'amber' },
  bahia: { key: 'bahia', label: 'Bahía', icon: 'bay', tone: 'orange' },
};
/** Áreas con función conocida por su nombre; ganan sobre el tipo genérico (`area`). */
const AREA_NAMES: [RegExp, Identity][] = [
  [/emergenc|urgenc|trauma/, { key: 'emergencia', label: 'Emergencia', icon: 'alert', tone: 'red' }],
  [/laborator/, { key: 'laboratorio', label: 'Laboratorio', icon: 'flask', tone: 'purple' }],
  [/farmaci|medicament/, { key: 'farmacia', label: 'Farmacia', icon: 'pill', tone: 'amber' }],
  [/quirofan|cirug|sala de operaci/, { key: 'quirofano', label: 'Quirófano', icon: 'scalpel', tone: 'indigo' }],
  [/hospitaliz|internamiento|encamad/, { key: 'hospitalizacion', label: 'Hospitalización', icon: 'bed', tone: 'blue' }],
  [/consult|ambulator/, { key: 'consulta', label: 'Consulta', icon: 'steth', tone: 'green' }],
  [/recepci|admision|citas/, { key: 'recepcion', label: 'Recepción', icon: 'desk', tone: 'orange' }],
  [/ambulanc|transporte/, { key: 'ambulancia', label: 'Ambulancia', icon: 'ambulance', tone: 'red' }],
  [/bodega|almacen|inventario/, { key: 'bodega', label: 'Bodega', icon: 'box', tone: 'amber' }],
  [/cuidado|intensiv|uci/, { key: 'cuidados', label: 'Cuidados intensivos', icon: 'heart', tone: 'magenta' }],
];

/** Por tipo de espacio (`area`, `planta`...) o, mejor, por nombre (`Emergencia`, `Laboratorio`). */
export function areaIdentity(typeOrName: string | null | undefined, type?: string | null): Identity {
  const name = fold(typeOrName ?? '');
  const byName = AREA_NAMES.find(([pattern]) => pattern.test(name));
  if (byName) return byName[1];
  const byType = AREA_TYPES[fold(type ?? '')] ?? AREA_TYPES[name];
  return byType ?? { key: 'area', label: typeOrName?.trim() || 'Área', icon: 'cube', tone: 'slate' };
}

const GLYPHS: Record<IdentityIcon, ReactNode> = {
  shield: <><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>,
  desk: <><path d="M3 11h18v4H3zM5 15v5M19 15v5" /><circle cx="12" cy="6" r="2.5" /></>,
  hand: <><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.500a1.500 1.500 0 0 1 3 0V11M14 11V6a1.500 1.500 0 0 1 3 0v8a6 6 0 0 1-6 6c-3 0-4-1.500-6-5l-1-2a1.500 1.500 0 0 1 3-1l1 1" /></>,
  heart: <><path d="M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.500A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11z" /><path d="M12 9v5M9.500 11.500h5" /></>,
  steth: <><path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8" /></>,
  ambulance: <><path d="M3 6h11v13H3zM14 10h4l3 4v5h-7z" /><path d="M7 9v6M4 12h6M6 19a2 2 0 1 0 4 0M16 19a2 2 0 1 0 4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 18v.01" /></>,
  building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01M2 21h20" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5M3 17.500l9 5 9-5" /></>,
  door: <><path d="M6 21V4h12v17M4 21h16" /><path d="M14 12v.01" /></>,
  bed: <><path d="M3 19V7M21 19v-6a3 3 0 0 0-3-3H9v6h12M3 16h18M6 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></>,
  box: <><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10" /></>,
  bay: <><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" /></>,
  scalpel: <><path d="M4 20 15 9M15 9l5-5-1 6-4 1zM4 20l3-1" /></>,
  pill: <><rect x="3" y="9" width="18" height="7" rx="3.500" transform="rotate(-35 12 12.500)" /><path d="m9.500 8.500 5 5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  cube: <><path d="m12 3 8 4.500v9L12 21l-8-4.500v-9z" /><path d="M12 12 4 7.500M12 12l8-4.500M12 12v9" /></>,
};

export function IdentityGlyph({ icon, size = 16 }: { icon: IdentityIcon; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{GLYPHS[icon]}</svg>;
}

type ChipProps = { label?: string; compact?: boolean; className?: string };

function IdentityChip({ identity, label, compact = false, className = '' }: ChipProps & { identity: Identity }) {
  const text = label ?? identity.label;
  // Modo compacto: solo el icono, con su nombre para lectores de pantalla y para quien pasa el cursor.
  return <span className={`identity-chip identity-tone-${identity.tone}${compact ? ' identity-compact' : ''} ${className}`.trim()} data-identity={identity.key} {...(compact ? { role: 'img', 'aria-label': text, title: text } : {})}>
    <IdentityGlyph icon={identity.icon} size={compact ? 18 : 15} />
    {!compact && <span>{text}</span>}
  </span>;
}

/** `code`: `MED`, `ENF`... o el tipo de personal de la API (`medico`). */
export function RoleChip({ code, ...rest }: ChipProps & { code: string | null | undefined }) {
  return <IdentityChip identity={roleIdentity(code)} {...rest} />;
}

/** `name`: nombre del área (`Emergencia`); `type`: tipo de espacio como respaldo (`area`, `planta`...). */
export function AreaChip({ name, type, ...rest }: ChipProps & { name?: string | null; type?: string | null }) {
  const identity = areaIdentity(name, type);
  return <IdentityChip identity={identity} {...rest} label={rest.label ?? (name?.trim() || identity.label)} />;
}
