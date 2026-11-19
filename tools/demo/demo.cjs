#!/usr/bin/env node
/*
 * CLIMESA · Reinicio de los datos de demostración (Lote 5, S17).                                    tools/demo/
 *
 *   node tools/demo/demo.cjs conteo                 Solo lee: filas demo y filas de cuentas de prueba por tabla.
 *   node tools/demo/demo.cjs limpiar                Simulación: corre limpiar-demo.sql, cuenta y DESHACE todo.
 *   node tools/demo/demo.cjs cargar                 Simulación: corre semilla-demo.sql, cuenta y DESHACE todo.
 *   node tools/demo/demo.cjs reiniciar              Simulación: limpiar y luego cargar, en una transacción que se deshace.
 *   node tools/demo/demo.cjs <limpiar|cargar|reiniciar> --ejecutar
 *                                                   Lo mismo, pero confirma los cambios (COMMIT).
 *
 * Conexión: variable DEMO_DATABASE_URL (rol dueño de las tablas, postgres en Supabase; nunca sghu_api). El programa nunca
 * imprime la contraseña ni lee demo-credenciales.json. Sin --ejecutar nada queda escrito: cada simulación termina en
 * ROLLBACK. Con --ejecutar, cada paso es su propia transacción (limpiar confirma antes de cargar).
 *
 * Usa el paquete `pg` instalado en api/ (cd api && npm ci). El núcleo (`simulate`) recibe un objeto con `exec(sql)` y
 * `rows(sql)`, así api/tests/datos-demo.spec.ts lo prueba sobre PGlite con el esquema completo.
 */
'use strict';
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const FOLDER = __dirname;
const SCHEMAS = ['plataforma', 'acceso', 'pacientes', 'infra', 'personal', 'atencion', 'laboratorio', 'hospitalizacion', 'ambulancia', 'inventario', 'publico'];
const STEPS = { limpiar: ['limpiar'], cargar: ['cargar'], reiniciar: ['limpiar', 'cargar'] };

/** SQL body of a step without its own BEGIN/COMMIT, so the caller owns the transaction. */
function stepSql(step) {
  const file = step === 'limpiar' ? 'limpiar-demo.sql' : 'semilla-demo.sql';
  const sql = readFileSync(resolve(FOLDER, file), 'utf8');
  const body = sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
  if (body === sql) throw new Error(`${file}: no se encontró su BEGIN/COMMIT de nivel superior`);
  // The cleanup refuses to run without this mark (explicit confirmation); SET LOCAL ends with the transaction.
  return step === 'limpiar' ? `set local demo.confirmar = 'limpiar';\n${body}` : body;
}

async function counts(db) {
  const tables = await db.rows(`select schemaname || '.' || tablename as t from pg_tables
    where schemaname in (${SCHEMAS.map(s => `'${s}'`).join(',')}) order by 1`);
  const sql = tables.map(({ t }) => `select '${t}' as t, count(*)::int as n from ${t}`).join(' union all ');
  return Object.fromEntries((await db.rows(sql)).map(r => [r.t, Number(r.n)]));
}

/** Runs the steps inside one transaction; returns { before, after, changes } and commits only when `execute`. */
async function simulate(db, steps, execute = false) {
  await db.exec('begin');
  try {
    const before = await counts(db);
    for (const step of steps) await db.exec(stepSql(step));
    const after = await counts(db);
    await db.exec(execute ? 'commit' : 'rollback');
    const changes = Object.keys(after).filter(t => after[t] !== before[t])
      .map(t => ({ tabla: t, antes: before[t], despues: after[t], diferencia: after[t] - before[t] }));
    return { before, after, changes };
  } catch (error) {
    await db.exec('rollback').catch(() => undefined);
    throw error;
  }
}

async function readOnlyCount(db) {
  await db.exec('begin read only');
  try {
    return await db.rows(readFileSync(resolve(FOLDER, 'conteo-demo.sql'), 'utf8'));
  } finally {
    await db.exec('rollback');
  }
}

function table(rows) {
  if (!rows.length) return '  (sin cambios)';
  const cols = Object.keys(rows[0]);
  const width = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c]).length)));
  const line = r => cols.map((c, i) => String(r[c]).padStart(i ? width[i] : 0).padEnd(i ? 0 : width[i])).join('  ');
  return [line(Object.fromEntries(cols.map(c => [c, c]))), ...rows.map(line)].map(l => '  ' + l).join('\n');
}

async function main(argv) {
  const [command = 'conteo', ...flags] = argv;
  const execute = flags.includes('--ejecutar');
  if (command !== 'conteo' && !STEPS[command]) {
    console.error('Uso: node tools/demo/demo.cjs <conteo|limpiar|cargar|reiniciar> [--ejecutar]');
    process.exitCode = 2;
    return;
  }
  if (command === 'conteo' && execute) {
    console.error('conteo solo lee; no lleva --ejecutar.');
    process.exitCode = 2;
    return;
  }
  const url = process.env.DEMO_DATABASE_URL;
  if (!url) {
    console.error('Falta DEMO_DATABASE_URL (cadena de conexión del rol dueño de las tablas). No se conectó a nada.');
    process.exitCode = 2;
    return;
  }
  const { Client } = require(require.resolve('pg', { paths: [resolve(FOLDER, '../../api')] }));
  const client = new Client({ connectionString: url });
  client.on('notice', n => console.log(`  NOTICE: ${n.message}`));
  await client.connect();
  try {
    const who = (await client.query('select current_user as usuario, current_database() as base')).rows[0];
    // Only host, database and role are printed: never the password.
    let host = '?';
    try { host = new URL(url).hostname; } catch { /* not a URL: keep "?" */ }
    console.log(`Conectado a ${host} / ${who.base} como ${who.usuario}.`);
    if (who.usuario === 'sghu_api') throw new Error('sghu_api no puede limpiar ni sembrar la demo: usa el rol dueño de las tablas.');
    const db = { exec: sql => client.query(sql), rows: async sql => (await client.query(sql)).rows };
    if (command === 'conteo') {
      console.log('Conteo (solo lectura): filas demo y filas de cuentas de prueba por tabla.');
      console.log(table(await readOnlyCount(db)));
      return;
    }
    const steps = STEPS[command];
    if (execute) {
      for (const step of steps) {
        console.log(`\n${step}: ejecutando y confirmando…`);
        console.log(table((await simulate(db, [step], true)).changes));
      }
    } else {
      console.log(`\nSimulación de ${steps.join(' + ')} (se deshace al final; nada queda escrito):`);
      console.log(table((await simulate(db, steps, false)).changes));
      console.log(`\nPara aplicarlo: node tools/demo/demo.cjs ${command} --ejecutar`);
    }
  } finally {
    await client.end();
  }
}

module.exports = { simulate, stepSql, counts, readOnlyCount, STEPS };

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
