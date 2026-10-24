import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createDatabase} from './support/database';
jest.setTimeout(120000);
describe('Invariantes SQL del esquema completo',()=>{
 test('las comprobaciones originales se ejecutan sin FALLO en PostgreSQL WASM',async()=>{
  const fixture=await createDatabase();
  try {
   const sql=readFileSync(resolve(__dirname,'../../supabase/pruebas/01_invariantes.sql'),'utf8').replace(/^\\set.*$/gm,'');
   // pg.exec trata un lote como una transacción implícita; separar los límites explícitos reproduce psql -f.
   const results:Awaited<ReturnType<typeof fixture.pg.exec>>=[];
   for(const block of sql.split(/^(begin;|rollback;)$/m))if(block.trim())results.push(...await fixture.pg.exec(block));
   const messages=results.flatMap(r=>r.rows.flatMap(row=>Object.values(row))).filter((v):v is string=>typeof v==='string');
   expect(messages.filter(v=>v.startsWith('FALLO'))).toEqual([]);
   expect(messages.filter(v=>v.startsWith('OK')).length).toBeGreaterThanOrEqual(28);
  } finally { await fixture.pg.close(); }
 });
});
