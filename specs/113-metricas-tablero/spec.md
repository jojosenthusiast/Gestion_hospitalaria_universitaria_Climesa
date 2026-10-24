# 113. Métricas y tablero

**Estado:** En revisión · **Semanas:** S2, S5 · **Depende de:** todas las anteriores · **Investigación:** R03, R04, R07 (indicadores)

## Objetivo

El "panel web mostrando dashboard inicial" del avance y las métricas del Administrador, con indicadores agregados que se actualizan solos y bandejas de trabajo por rol.

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-113-01 | El tablero inicial debe mostrar ocupación por planta, camas en limpieza, estado de la ambulancia, números en fila, órdenes de laboratorio por estado y huecos de cobertura de turnos. | R | avance; REQ-ROL-01 |
| FR-113-02 | Las tarjetas del tablero deben actualizarse en vivo. | R | REQ-PLT-06 |
| FR-113-03 | El tablero no debe mostrar datos personales: solo agregados. | R | REQ-PRV-01 |
| FR-113-04 | Recepción, laboratorio y delegado deben ver al entrar una bandeja con sus pendientes y contadores en vivo. | R | D-050 |
| FR-113-05 | El sistema debe calcular ocupación diaria, estancia promedio, tiempo de laboratorio (orden a Completado), tiempo de respuesta de la ambulancia y cobertura de turnos, por rango de fechas. | E | R03, R04, R07 |
| FR-113-06 | Mientras no hay datos de un módulo todavía construido, la tarjeta debe mostrar "Disponible en la semana N" en lugar de cero. | R | método de avance |

## Escenarios de aceptación

1. **Tablero vivo.** Dado el tablero abierto, cuando se asigna una cama desde Android, entonces la ocupación de la planta cambia sin recargar.
2. **Sin datos personales.** Dada cualquier tarjeta, entonces ninguna respuesta del tablero contiene nombres, DUI ni expediente.

## Reglas, datos, endpoints y pantallas
- Endpoints: spec 113. Pantallas: W03, W04, W33.

## Preguntas abiertas
Ninguna.
