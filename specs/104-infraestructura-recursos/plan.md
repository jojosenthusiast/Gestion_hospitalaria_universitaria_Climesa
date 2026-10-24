# 104. Plan

## Backend
Módulo `Infraestructura`. El estado de la cama se calcula en una vista `infra.v_estado_cama` que combina bloqueos, limpiezas abiertas y la vista publicada `hospitalizacion.v_ocupacion_activa` (y reservas). Endpoints de árbol con CTE recursiva y protección de profundidad.

## Base de datos
`0005_infra.sql`: `infra.espacio` (padre_id, tipo, codigo único, categoria, capacidad), disparador de capacidad, `bloqueo_cama`, `limpieza_cama` (CHECK verificada_por distinto de limpiada_por), `tipo_equipo`, `equipo`. Semilla `supabase/seed/01_edificio.sql`.

## Eventos de tiempo real
`cama.estado_cambiado` (REC, JOP, área, y agregado público), `cama.limpieza_pendiente`.

## Clientes
Web: árbol recursivo (componente que se llama a sí mismo) y plano por planta. Android: tablero y lista de limpieza.

## Pruebas
Capacidad, reducción bajo ocupación, conteos recursivos, limpieza por la misma persona, evento tras verificar.

## Riesgos
Ninguno relevante.
