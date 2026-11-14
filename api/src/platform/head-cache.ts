import { DatabaseService } from './database.service';
import { Clock } from './clock';

/**
 * Caché corta de lecturas agregadas (planes 112 y 113). Una entrada vale mientras no pase su tiempo de vida
 * y la cabeza de `plataforma.outbox` no cambie: cualquier evento confirmado invalida todas las entradas, así
 * que un cliente que vuelve a pedir tras un evento nunca recibe el dato anterior a ese evento.
 * La cabeza se lee antes de cargar: si entra un evento durante la carga, la siguiente lectura recarga.
 */
export class HeadCache {
  private readonly entries = new Map<string, { head: string; at: number; value: unknown }>();
  constructor(private readonly db: DatabaseService, private readonly clock: Clock, private readonly ttlMs: number) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const head = (await this.db.query<{ head: string }>('SELECT coalesce(max(seq),0)::text AS head FROM plataforma.outbox'))[0]?.head ?? '0';
    const now = this.clock.now().valueOf();
    const entry = this.entries.get(key);
    if (entry && entry.head === head && now - entry.at < this.ttlMs) return entry.value as T;
    const value = await load();
    this.entries.set(key, { head, at: now, value });
    return value;
  }

  clear() { this.entries.clear(); }
}
