# 120. Cliente web

**Estado:** En revisión · **Semanas:** S1 a S5 · **Depende de:** 100, 101 · **Investigación:** ADR-0003, ADR-0005; `docs/diseno/inventario-pantallas.md`

## Objetivo

Panel web administrativo en React para Administrador, Jefe de Operaciones, Recepción, Laboratorio y Delegado, más la pantalla pública, con navegación por rol, datos en vivo y los estados comunes de toda pantalla.

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-120-01 | La web debe construirse con React, TypeScript y Vite, con estructura por módulo (`api`, `features/<modulo>`, `components`, `routes`). | R | REQ-PLT-03; ADR-0003 |
| FR-120-02 | Al iniciar sesión, la web debe pedir `/me` y mostrar solo el menú y las rutas que el usuario puede usar. | R | REQ-PRV-04 |
| FR-120-03 | Si un rol sin web inicia sesión, entonces la web debe mostrar "Tu rol no usa esta aplicación". | R | D-052 |
| FR-120-04 | La web debe suscribirse a los canales de Realtime de `/me` e invalidar las consultas afectadas por cada evento. | R | REQ-PLT-06; ADR-0005 |
| FR-120-05 | Al reconectarse, la web debe volver a pedir los datos visibles y mostrar una banda mientras esté desconectada. | R | ADR-0005 |
| FR-120-06 | Cada pantalla debe implementar los estados cargando, vacío, error, sin permiso, sin conexión y conflicto. | R | inventario de pantallas |
| FR-120-07 | Cada acción que cambia estado debe generar una clave de idempotencia y reutilizarla al reintentar. | R | D-007 |
| FR-120-08 | La web debe cumplir contraste AA, navegación por teclado y textos en español. | R | entregable Figma "paleta accesible" |
| FR-120-09 | La ruta `/publico` debe funcionar sin sesión en modo televisor. | R | spec 112 |
| FR-120-10 | La web debe cerrar sesión tras 15 min de inactividad. | R | privacidad.md 3.6 |

## Escenarios de aceptación
1. **Menú por rol.** Dado un Laboratorista, cuando entra, entonces solo ve Inicio, Laboratorio, Inventario y Perfil.
2. **Reconexión.** Dada la web sin red durante un cambio de cama, cuando vuelve la red, entonces el tablero muestra el estado correcto sin recargar.

## Pantallas
W01 a W36.
