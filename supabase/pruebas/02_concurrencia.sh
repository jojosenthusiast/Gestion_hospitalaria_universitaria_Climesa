#!/usr/bin/env bash
# Solo base local desechable, después de 00 + migrations + seed + 01. Cada resultado se comprueba y un fallo devuelve código 1.
set -euo pipefail
: "${PSQL:?Define PSQL para la base LOCAL de pruebas, por ejemplo psql -U postgres -d sghu_test}"
read -r -a psql_args <<< "$PSQL"
q() { "${psql_args[@]}" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
check() { if [[ "$2" != "$3" ]]; then echo "FALLO $1: $2 (esperado $3)"; exit 1; fi; echo "OK $1: $2"; }
wait_all() { for pid in "${pids[@]}"; do wait "$pid" || true; done; }
task_output=$(mktemp)
trap 'rm -f "$task_output"' EXIT
q "delete from atencion.contador_fila where servicio='conc'"
pids=()
for i in $(seq 1 50); do q "select atencion.emitir_numero('conc','2026-12-01')" >>"$task_output" & pids+=("$!"); done
wait_all
check '50 números distintos' "$(sort -n "$task_output" | uniq | wc -l | tr -d ' ')" 50
check 'último número' "$(sort -n "$task_output" | tail -1)" 50
q "insert into pacientes.paciente(id,expediente,nombres,primer_apellido,sexo,precision_nacimiento) values
 ('00000000-0000-0000-0000-00000000c0c1','EXP-C1','Uno','Conc','femenino','desconocida'),
 ('00000000-0000-0000-0000-00000000c0c2','EXP-C2','Dos','Conc','femenino','desconocida')"
q "insert into hospitalizacion.admision(id,paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id) values
 ('00000000-0000-0000-0000-00000000d0c1','00000000-0000-0000-0000-00000000c0c1','emergencia',gen_random_uuid(),'semiprivada','femenino',gen_random_uuid()),
 ('00000000-0000-0000-0000-00000000d0c2','00000000-0000-0000-0000-00000000c0c2','emergencia',gen_random_uuid(),'semiprivada','femenino',gen_random_uuid())"
pids=()
for a in d0c1 d0c2; do q "insert into hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) select '00000000-0000-0000-0000-00000000$a',id,padre_id,'semiprivada',tstzrange(now(),NULL) from infra.espacio where codigo='HAB-206-B'" >/dev/null 2>&1 & pids+=("$!"); done
wait_all
check 'una ocupación confirmada' "$(q "select count(*) from hospitalizacion.ocupacion_cama o join infra.espacio c on c.id=o.cama_id where c.codigo='HAB-206-B'")" 1
q "update ambulancia.servicio set finalizado_en=now(),estado_final='completado' where finalizado_en is null"
pids=()
for i in 1 2; do q "insert into ambulancia.servicio(unidad_id,tipo,prioridad,origen,destino,despachado_por) select id,'emergencia_domicilio','roja','Origen de prueba $i','Hospital',gen_random_uuid() from ambulancia.unidad" >/dev/null 2>&1 & pids+=("$!"); done
wait_all
check 'un servicio de ambulancia' "$(q 'select count(*) from ambulancia.servicio where finalizado_en is null')" 1
pids=()
for h in 8 9; do q "insert into personal.turno(persona_id,area_id,periodo,tipo) select id,area_id,tstzrange('2026-12-05 0$h:00-06','2026-12-05 1$h:00-06'),'diurno' from personal.persona where apellidos='Rivas Orellana'" >/dev/null 2>&1 & pids+=("$!"); done
wait_all
check 'un turno traslapado' "$(q "select count(*) from personal.turno t join personal.persona p on p.id=t.persona_id where p.apellidos='Rivas Orellana' and t.periodo && tstzrange('2026-12-05','2026-12-06')")" 1
pids=()
for i in 1 2; do q "insert into pacientes.identificador(paciente_id,tipo,emisor,valor_original,valor_normalizado,exclusivo) values('00000000-0000-0000-0000-00000000c0c1','dui','RNPN','09876543-2','098765432',true)" >/dev/null 2>&1 & pids+=("$!"); done
wait_all
check 'un DUI único' "$(q "select count(*) from pacientes.identificador where valor_normalizado='098765432'")" 1
pids=()
for p in c0c1 c0c2; do q "insert into atencion.cita(paciente_id,medico_id,horario,estado,origen) select '00000000-0000-0000-0000-00000000$p',id,tstzrange('2026-12-07 10:00-06','2026-12-07 10:20-06'),'confirmada','recepcion' from personal.persona where apellidos='Aguilar Pineda'" >/dev/null 2>&1 & pids+=("$!"); done
wait_all
check 'una cita por médico y horario' "$(q "select count(*) from atencion.cita where horario && tstzrange('2026-12-07 10:00-06','2026-12-07 10:20-06')")" 1
