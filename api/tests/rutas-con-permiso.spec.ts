import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../src/app.module';
import { REQUIRED_PERMISSION } from '../src/auth/permission.decorator';
import { HealthController } from '../src/health/health.controller';

type Klass = abstract new (...args: never[]) => unknown;

/** Every controller registered under AppModule, walking imports (plain, dynamic and forwardRef modules). */
function controllersOf(root: unknown): Klass[] {
  const seen = new Set<unknown>(), found = new Set<Klass>();
  const visit = (entry: unknown) => {
    if (!entry) return;
    const ref = entry as { forwardRef?: () => unknown; module?: unknown; controllers?: Klass[]; imports?: unknown[] };
    if (typeof ref.forwardRef === 'function') return visit(ref.forwardRef());
    const module = typeof entry === 'function' ? entry : ref.module;
    // Async dynamic modules of libraries (a Promise) declare no application controllers.
    if (typeof module !== 'function' || seen.has(entry)) return;
    seen.add(entry);
    for (const c of [...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module as object) ?? []), ...(ref.controllers ?? [])]) found.add(c);
    for (const i of [...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, module as object) ?? []), ...(ref.imports ?? [])]) visit(i);
  };
  visit(root);
  return [...found];
}

const join = (...parts: string[]) => '/' + parts.flatMap(p => p.split('/')).filter(Boolean).join('/');

/** Every route as `METHOD /path` with its handler, read from Nest's own routing metadata. */
function routes() {
  const all: { route: string; controller: Klass; permission: unknown }[] = [];
  for (const controller of controllersOf(AppModule)) {
    const prefixes = [Reflect.getMetadata(PATH_METADATA, controller) ?? ''].flat() as string[];
    const proto = (controller as unknown as { prototype: Record<string, unknown> }).prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const paths = [Reflect.getMetadata(PATH_METADATA, handler) ?? ''].flat() as string[];
      const permission = Reflect.getMetadata(REQUIRED_PERMISSION, handler) ?? Reflect.getMetadata(REQUIRED_PERMISSION, controller);
      for (const prefix of prefixes) for (const path of paths) all.push({ route: `${RequestMethod[method]} ${join(prefix, path)}`, controller, permission });
    }
  }
  return all;
}

// S4 (parcial 3): a route without @RequirePermission is reachable by any signed-in account. Only health/readiness
// and the anonymous /publico/* reads may go without one.
describe('toda ruta de controlador declara @RequirePermission', () => {
  const all = routes();
  const exempt = (r: { route: string; controller: Klass }) => r.controller === HealthController || / \/publico(\/|$)/.test(r.route);

  test('la enumeración encuentra los controladores de AppModule', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.map(r => r.route)).toEqual(expect.arrayContaining(['GET /health', 'GET /publico/ocupacion', 'POST /admisiones/:id/cama']));
  });

  test('ninguna ruta fuera de health y /publico/* queda sin permiso', () => {
    const missing = all.filter(r => !exempt(r) && (r.permission === undefined || (Array.isArray(r.permission) && r.permission.length === 0))).map(r => r.route);
    expect(missing).toEqual([]);
  });

  test('las rutas exentas son solo health/salud y /publico/*', () => {
    const free = all.filter(r => r.permission === undefined).map(r => r.route).sort();
    expect(free.every(route => /^GET \/(health|salud)$/.test(route) || / \/publico(\/|$)/.test(route))).toBe(true);
  });
});
