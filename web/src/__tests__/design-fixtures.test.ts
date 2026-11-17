/**
 * The design preview (work-preview.html) must render every web module, for every role, with fixture data: no request a
 * page makes on open may fail (in particular, none may fall through to "Esta vista no tiene datos de diseño."), and no
 * module may end in its error notice. The counter and the Pacientes module read one shared patient set.
 */
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import permissions from '../design/permissions.json';
import { FixtureApi, fixtureProfile } from '../design/fixtures';
import { HospitalShell, visibleModules } from '../features/shell';
import type { Patient } from '../lib/api';

beforeEach(() => {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

describe('design fixtures cover every web module', () => {
  for (const role of Object.keys(permissions)) {
    it(`${role}: every visible module opens with fixture data`, async () => {
      const profile = fixtureProfile(role);
      const failed = new Set<string>(), broken: string[] = [];
      for (const module of visibleModules(profile)) {
        const api = new FixtureApi(role);
        const request = api.request.bind(api);
        api.request = (async (path: string) => {
          try { return await request(path); }
          catch (e) { failed.add(`${module.id} ${path}: ${e instanceof Error ? e.message : String(e)}`); throw e; }
        }) as typeof api.request;
        location.hash = `#/${module.id}`;
        render(createElement(HospitalShell, { api, profile, onLogout: () => undefined }));
        await act(async () => { await new Promise(r => setTimeout(r, 150)); });
        if (document.body.textContent?.includes('No se pudo abrir este módulo')) broken.push(module.id);
        cleanup();
      }
      expect([...failed]).toEqual([]);
      expect(broken).toEqual([]);
    }, 30_000);
  }

  it('serves the detail paths the modules open from a row', async () => {
    const api = new FixtureApi('JOP');
    const [patient] = await api.request<Patient[]>('/pacientes?limit=1');
    const order = (await new FixtureApi('LAB').request<{ id: string }[]>('/laboratorio/ordenes'))[0];
    const article = (await api.request<{ id: string }[]>('/inventario/articulos'))[0];
    const admission = (await api.request<{ id: string }[]>('/admisiones'))[0];
    const audit = (await new FixtureApi('DPD').request<{ filas: { seq: string }[] }>('/auditoria/registros?pagina=1&limite=25')).filas[0];
    const service = (await api.request<{ activeService: { id: string } }>('/ambulancia')).activeService;
    const unsigned = (await new FixtureApi('MED').request<{ id: string }[]>('/consultas/sin-firmar'))[0];
    const paths = [
      `/pacientes/${patient.id}`, `/pacientes/${patient.id}/historial`, `/citas?patientId=${patient.id}`, `/laboratorio/ordenes/${order.id}`, '/laboratorio/catalogo',
      `/inventario/articulos/${article.id}`, '/inventario/bodegas', `/admisiones/${admission.id}/sugerencias-cama`, `/admisiones/mapa-camas?patientId=${patient.id}`,
      `/admisiones/origenes?patientId=${patient.id}`, '/admisiones/medicos-disponibles', '/admisiones/factibilidad?patientId=x', `/auditoria/registros/${audit.seq}`,
      `/ambulancia/servicios/${service.id}/prehospital`, `/consultas/${unsigned.id}/detalle`, '/turnos/especialistas?from=2026-11-16', '/turnos/plantillas',
    ];
    for (const path of paths) await expect(new FixtureApi('MED').request(path), path).resolves.toBeTruthy();
  });

  it('the counter selector and the Pacientes module read the same patients, with no repeated surnames', async () => {
    const api = new FixtureApi('REC');
    const list = await api.request<Patient[]>('/pacientes?limit=1000');
    const selector = await api.request<{ items: { id: string; fullName: string }[] }>('/pacientes/selector?limit=1000');
    expect(list.length).toBeGreaterThanOrEqual(300);
    expect(selector.items.map(p => p.id)).toEqual(list.map(p => p.id));
    for (const p of list) {
      expect(p.fullName).toBe(`${p.givenNames} ${p.surnames}`);
      const words = p.surnames.split(' ');
      expect(new Set(words).size, p.fullName).toBe(words.length);
    }
  });
});
