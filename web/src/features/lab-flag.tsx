import type { LabFlagTone } from '../lib/lab-sheet';
import './lab-flag.css';

/** Lote 5 S13: «En rango», «Alto», «Bajo», «Crítico alto»… next to a lab value, tinted by how far it is from its range. */
export function LabFlagChip({ flag }: { flag: { label: string; tone: LabFlagTone } }) {
  return <span className={`lab-flag is-${flag.tone}`}>{flag.label}</span>;
}
