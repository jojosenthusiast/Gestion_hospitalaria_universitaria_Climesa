# 104. Tareas

- [x] T01 · S1 · R · Migración 0005 del árbol de espacios con capacidad y semilla del curso
  - Cubre: FR-104-01, FR-104-02, FR-104-03
  - Depende de: 100-T03
  - Hecho cuando: la semilla deja 17 camas de hospitalización y el escenario 1 pasa
  - Verificado: Aplicada en Supabase con semilla: 17 camas (12 semiprivadas, 5 VIP); prueba 2: capacidad_excedida
- [x] T02 · S2 · R · Consultas recursivas de árbol, ruta y disponibilidad
  - Cubre: FR-104-05, FR-104-13
  - Depende de: T01
  - Hecho cuando: escenario 2 pasa con datos de ocupación de prueba
  - Verificado: 29-oct-2026 `npm test -- --ci` en api: `api/tests/infraestructura-ocupacion.spec.ts` ocupa 3 camas de la planta 2 y comprueba P2 con 9 de 12 libres, conteo por habitación (0, 2, 1, 2, 2, 2) y ruta legible; 15 suites y 186 pruebas pasan, `npx tsc --noEmit` sin errores
- [x] T03 · S3 · R · Tablero de camas con estados y ocupante según permiso
  - Cubre: FR-104-06, FR-104-08
  - Depende de: T02, 108-T01
  - Hecho cuando: REC ve nombres, ENF de otra planta ve iniciales
  - Verificado: 29-oct-2026 `npm test -- --ci` en api: REC ve "Ana Lucía Ejemplo Hernández", ENF fuera del área ve "A.L.E.H." sin `patientId`, y una cama con reserva activa sale `reservada`
- [x] T04 · S2 · R · Edición de espacios (ADM) con regla de capacidad bajo ocupación
  - Cubre: FR-104-04
  - Depende de: T01
  - Hecho cuando: reducir capacidad de habitación ocupada responde 409
  - Verificado: 29-oct-2026 `npm test -- --ci` en api: reducir HAB-201 con 2 camas ocupadas responde 409 `capacidad_bajo_ocupacion` con mensaje de ocupación y no cambia versión; con camas activas sin ocupación el P0001 `capacidad_menor_que_camas` responde 409 (no 500)
- [x] T05 · S3 · R · Pantallas W09 (árbol) y W12 (plano por planta) en web
  - Cubre: FR-104-05, FR-104-06
  - Depende de: T03, 120-T02
  - Hecho cuando: se ven las plantas 2 y 3 con sus 17 camas y estados
  - Avance 29-oct-2026 (web): `web/src/__tests__/espacios.test.tsx` comprueba con datos ficticios que W12 (`BedsPage`) muestra la planta 2 con 12 camas y la planta 3 con 5 (17 en total) con su estado por habitación, el cambio de planta y el filtro por estado, y que W09 (`SpacesPage`) lista el árbol con camas libres por nodo y el plano por planta; `spaces.tsx` ya agrupaba por planta y habitación, sin cambios. 120-T02 ya está hecha.
  - Verificado: 29-oct-2026 `web/src/__tests__/espacios.test.tsx` (5 pruebas) y `web/src/__tests__/navegacion.test.tsx` (19 pruebas; JOP y REC ven Camas y Edificio, ADM solo Edificio, LAB y DPD ninguno) pasan: `npm test` en `web/` 58 pruebas. De solo lectura contra la API desplegada, `GET /api/v1/camas` con la cuenta demo REC devuelve 17 camas: 12 en la planta 2 y 5 en la planta 3, todas libres. No se abrió la pantalla en un navegador contra la API; el render del plano y del árbol se comprueba con datos ficticios en pruebas
- [ ] T06 · S4 · R · Bloqueo, limpieza y verificación con eventos en vivo
  - Cubre: FR-104-07, FR-104-09, FR-104-10, FR-104-11
  - Depende de: T03
  - Hecho cuando: escenario 3 pasa en Android con el tablero web abierto
  - Avance 29-oct-2026 (API y web): `POST /camas/:id/bloquear`, `desbloquear`, `limpieza`, `limpieza/completar` y `limpieza/verificar` con versión, motivo, auditoría y evento `cama.estado_cambiado`; `api/tests/core.integration.spec.ts` cubre las transiciones y `web/src/__tests__/spaces.test.tsx` las acciones del tablero. **Sigue abierta**: falta el escenario 3 en Android con el tablero web abierto.
  - Avance 30-oct-2026 (Android): `BedsViewModel` y `BedsScreen` con bloquear, retirar bloqueo, solicitar, completar y verificar limpieza según los permisos de `/auth/me`, versión y motivo en el cuerpo, mensajes en español para 403 y 409 (incluida la regla de que quien limpió no verifica) y recarga al llegar `cama.*` por Realtime. Hay pruebas unitarias con repositorios falsos (`BedsViewModelTest`, `BedRulesTest`). **No verificado en emulador ni dispositivo**; la tarea sigue abierta hasta correr el escenario 3 con el tablero web abierto.
- [ ] T07 · S5 · E · Equipo médico por espacio
  - Cubre: FR-104-12
  - Depende de: T01
  - Hecho cuando: un monitor pasa a mantenimiento y se ve en W24


## Verificación del corte 0.3.0 · 24-oct-2026

14 migraciones y semilla probadas; árbol de 17 camas, capacidad, tablero y filtrado de ocupante. Vistas web de árbol y plantas verificadas con datos ficticios. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
