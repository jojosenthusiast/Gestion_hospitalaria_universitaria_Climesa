# Estado del proyecto

> Generado por `tools/progreso.py` desde `specs/*/tasks.md`. No editar a mano.

**Tareas:** 38 de 131 (29%) · **Requisitos:** 221 · **Specs:** 20

## Por spec

| Spec | Estado | Requisitos R/E/F | Tareas | Avance |
|---|---|---|---|---|
| [100 Plataforma de la API](./100-plataforma-api/spec.md) | En revisión | 17/2/0 | 8/10 | ████████░░ |
| [101 Identidad, cuentas y acceso](./101-identidad-acceso/spec.md) | En revisión | 15/1/0 | 4/8 | █████░░░░░ |
| [102 Pacientes](./102-pacientes/spec.md) | En revisión | 11/1/0 | 4/7 | ██████░░░░ |
| [103 Personal de salud y turnos](./103-personal-turnos/spec.md) | En revisión | 11/3/0 | 7/9 | ████████░░ |
| [104 Edificio, camas y recursos](./104-infraestructura-recursos/spec.md) | En revisión | 12/1/0 | 5/7 | ███████░░░ |
| [105 Fila del día y citas](./105-fila-citas/spec.md) | En revisión | 10/2/0 | 1/6 | ██░░░░░░░░ |
| [106 Consulta general](./106-consulta-general/spec.md) | En revisión | 11/1/0 | 1/7 | █░░░░░░░░░ |
| [107 Laboratorio](./107-laboratorio/spec.md) | En revisión | 11/2/0 | 1/7 | █░░░░░░░░░ |
| [108 Admisión y hospitalización](./108-admision-hospitalizacion/spec.md) | En revisión | 14/2/0 | 1/10 | █░░░░░░░░░ |
| [109 Ambulancia](./109-ambulancia/spec.md) | En revisión | 14/3/0 | 2/10 | ██░░░░░░░░ |
| [110 Privacidad y auditoría](./110-privacidad-auditoria/spec.md) | En revisión | 8/2/0 | 1/8 | █░░░░░░░░░ |
| [111 Inventario de insumos](./111-inventario/spec.md) | En revisión | 7/1/0 | 1/4 | ██░░░░░░░░ |
| [112 Información pública y avisos](./112-informacion-publica/spec.md) | En revisión | 4/2/0 | 0/3 | ░░░░░░░░░░ |
| [113 Métricas y tablero](./113-metricas-tablero/spec.md) | En revisión | 5/1/0 | 0/4 | ░░░░░░░░░░ |
| [114 Avisos y alarmas](./114-avisos-alarmas/spec.md) | En revisión | 6/4/0 | 0/3 | ░░░░░░░░░░ |
| [120 Cliente web](./120-cliente-web/spec.md) | En revisión | 10/0/0 | 3/5 | ██████░░░░ |
| [121 Cliente Android](./121-cliente-android/spec.md) | En revisión | 6/2/0 | 0/6 | ░░░░░░░░░░ |
| [122 Cliente iOS](./122-cliente-ios/spec.md) | En revisión | 6/1/0 | 0/5 | ░░░░░░░░░░ |
| [130 Calidad y pruebas de concurrencia](./130-calidad-concurrencia/spec.md) | En revisión | 6/0/0 | 0/6 | ░░░░░░░░░░ |
| [131 Documentación y entrega](./131-documentacion-entrega/spec.md) | En revisión | 5/1/0 | 0/6 | ░░░░░░░░░░ |

## Por semana

| Semana | Fechas | R hechas | E hechas | Total |
|---|---|---|---|---|
| S1 | 17 a 23 oct | 12/12 | 0/0 | ██████████ |
| S2 | 24 a 30 oct | 21/36 | 1/1 | ██████░░░░ |
| S3 | 31 oct a 6 nov | 2/29 | 0/0 | █░░░░░░░░░ |
| S4 | 7 a 13 nov | 0/22 | 0/0 | ░░░░░░░░░░ |
| S5 | 14 a 20 nov | 0/8 | 2/23 | █░░░░░░░░░ |

## Para el avance del 31 de octubre (tareas R de S1 y S2)

- [x] 100-T01 · Crear monorepo y solución backend con proyectos por módulo
- [x] 100-T02 · Portar plataforma del legado (Db, CommandRunner, Idempotency, Outbox, Audit, PolicyRegistry, Clock)
- [x] 100-T03 · Migración 0001 de plataforma con roles, RLS y disparador de Realtime
- [x] 100-T04 · Validación del JWT de Supabase y construcción del actor
- [x] 100-T05 · Filtro de permisos por endpoint con auditoría de denegados
- [x] 100-T06 · Errores uniformes, conflicto de versión y registro sin datos sensibles
- [x] 100-T07 · OpenAPI con permisos y endpoint de salud
- [x] 100-T08 · Contenedor y despliegue de la API en la nube
- [x] 101-T01 · Migración 0002 de acceso y semilla de roles y permisos desde los CSV
- [x] 101-T02 · Disparador de alta de usuario y rol Paciente por defecto
- [x] 101-T03 · Endpoint `/auth/me` con permisos efectivos y plataformas
- [ ] 101-T04 · Gancho de token con canales de Realtime
- [x] 101-T05 · Invitación de personal, asignación de roles y desactivación
- [ ] 101-T06 · Pantallas de ingreso y registro en web, Android e iOS
- [x] 102-T01 · Migración 0003 de pacientes portada del legado
- [x] 102-T02 · Portar dominio: claves fonéticas, DUI, expediente, identidad provisional
- [x] 102-T03 · CRUD: buscar, registrar tras buscar, ver, editar con historial, inactivar
- [ ] 102-T05 · Pantallas de pacientes en web (W26) y Android (A30)
- [x] 103-T01 · Migración 0004 de personal y turnos con exclusión
- [x] 103-T02 · CRUD de personal (con y sin cuenta)
- [x] 103-T03 · Crear y mover turnos con duración y descanso por política
- [x] 103-T04 · Pantallas de personal en web (W07, W08)
- [x] 103-T06 · Cobertura, publicación con advertencias y estados automáticos
- [x] 104-T01 · Migración 0005 del árbol de espacios con capacidad y semilla del curso
- [x] 104-T02 · Consultas recursivas de árbol, ruta y disponibilidad
- [x] 104-T04 · Edición de espacios (ADM) con regla de capacidad bajo ocupación
- [x] 105-T01 · Migración de fila y citas con unicidad y exclusión
- [x] 106-T01 · Migración de consulta, signos, diagnósticos, recetas y semilla CIE-10
- [x] 107-T01 · Migración de laboratorio, catálogo recursivo y semilla con rangos
- [x] 108-T01 · Migración de hospitalización con exclusión de ocupaciones y vista publicada
- [x] 109-T01 · Migración de ambulancia con unidad única y servicio activo único
- [x] 109-T02 · Estado de la unidad visible en vivo y regla de paramédico de turno
- [x] 110-T06 · Matriz RBAC y política de campos generadas y verificadas
- [x] 111-T01 · Migración de inventario y semilla
- [ ] 113-T01 · Tablero inicial con tarjetas de camas, turnos y pacientes y marcadores de semana
- [x] 120-T01 · Proyecto React con TypeScript, rutas, ingreso con Supabase y despliegue
- [x] 120-T02 · Navegación por rol desde `/me`, estados comunes y cliente de API generado
- [x] 120-T03 · Suscripción a Realtime con invalidación y reconexión
- [ ] 121-T01 · Proyecto Gradle con Compose, Hilt, red y pantalla de ingreso
- [ ] 121-T02 · Navegación por rol y maquetación de las pantallas principales de cada rol
- [ ] 121-T03 · Repositorio de Realtime e invalidación en ViewModels
- [ ] 122-T01 · Proyecto Xcode con SwiftUI, paquetes y pantalla de ingreso
- [ ] 122-T02 · Pestañas por rol y maquetación de las pantallas de Médico y Paciente
- [ ] 122-T03 · Servicio de Realtime e invalidación en view models
- [ ] 130-T06 · Lista de pruebas manuales por pantalla
- [ ] 131-T01 · Diagrama ER, arquitectura, RBAC y privacidad para el avance
- [ ] 131-T02 · README raíz con instalación de las tres plataformas
- [ ] 131-T03 · Enlace de Figma y sistema de diseño en la documentación

## Verificación de trazabilidad

Sin errores: toda tarea cubre requisitos existentes, toda dependencia existe, todo requisito tiene tarea y todo requisito del curso está en alguna spec.
