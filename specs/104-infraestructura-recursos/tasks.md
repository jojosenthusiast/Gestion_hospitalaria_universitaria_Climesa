# 104. Tareas

- [x] T01 · S1 · R · Migración 0005 del árbol de espacios con capacidad y semilla del curso
  - Cubre: FR-104-01, FR-104-02, FR-104-03
  - Depende de: 100-T03
  - Hecho cuando: la semilla deja 17 camas de hospitalización y el escenario 1 pasa
  - Verificado: Aplicada en Supabase con semilla: 17 camas (12 semiprivadas, 5 VIP); prueba 2: capacidad_excedida
- [ ] T02 · S2 · R · Consultas recursivas de árbol, ruta y disponibilidad
  - Cubre: FR-104-05, FR-104-13
  - Depende de: T01
  - Hecho cuando: escenario 2 pasa con datos de ocupación de prueba
- [ ] T03 · S3 · R · Tablero de camas con estados y ocupante según permiso
  - Cubre: FR-104-06, FR-104-08
  - Depende de: T02, 108-T01
  - Hecho cuando: REC ve nombres, ENF de otra planta ve iniciales
- [ ] T04 · S2 · R · Edición de espacios (ADM) con regla de capacidad bajo ocupación
  - Cubre: FR-104-04
  - Depende de: T01
  - Hecho cuando: reducir capacidad de habitación ocupada responde 409
- [ ] T05 · S3 · R · Pantallas W09 (árbol) y W12 (plano por planta) en web
  - Cubre: FR-104-05, FR-104-06
  - Depende de: T03, 120-T02
  - Hecho cuando: se ven las plantas 2 y 3 con sus 17 camas y estados
- [ ] T06 · S4 · R · Bloqueo, limpieza y verificación con eventos en vivo
  - Cubre: FR-104-07, FR-104-09, FR-104-10, FR-104-11
  - Depende de: T03
  - Hecho cuando: escenario 3 pasa en Android con el tablero web abierto
  - Avance 29-oct-2026 (API y web): `POST /camas/:id/bloquear`, `desbloquear`, `limpieza`, `limpieza/completar` y `limpieza/verificar` con versión, motivo, auditoría y evento `cama.estado_cambiado`; `api/tests/core.integration.spec.ts` cubre las transiciones y `web/src/__tests__/spaces.test.tsx` las acciones del tablero. **Sigue abierta**: falta el escenario 3 en Android con el tablero web abierto.
- [ ] T07 · S5 · E · Equipo médico por espacio
  - Cubre: FR-104-12
  - Depende de: T01
  - Hecho cuando: un monitor pasa a mantenimiento y se ve en W24


## Verificación del corte 0.3.0 · 24-oct-2026

14 migraciones y semilla probadas; árbol de 17 camas, capacidad, tablero y filtrado de ocupante. Vistas web de árbol y plantas verificadas con datos ficticios. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
