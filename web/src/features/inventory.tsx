import type { AccessProfile, Api } from '../lib/api';
import { InventoryWorkspace } from './inventory/InventoryWorkspace';

type Stock = { articulo_id: string; bajo_minimo: boolean };
/** RN-37 / FR-111-06: one alert per article whose available stock is below its minimum (the API computes `bajo_minimo`). */
export const lowStockAlerts = <T extends Stock>(rows: T[]): T[] => [...new Map(rows.filter(r => r.bajo_minimo).map(r => [r.articulo_id, r])).values()];

export function InventoryPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  return <InventoryWorkspace api={api} profile={profile} version={version} />;
}
