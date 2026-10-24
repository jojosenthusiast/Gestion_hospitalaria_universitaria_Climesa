# 111. Inventario de insumos

**Estado:** En revisión · **Semanas:** S4 · **Depende de:** 104 · **Investigación:** R06; Código Tributario Art. 142-143; D-057

## Objetivo

"Administración de recursos e inventarios" del curso para insumos médicos y reactivos: existencias por bodega, lote y vencimiento, movimientos trazables y alertas de mínimo en vivo.

## Alcance
- Dentro: artículos, bodegas (espacios del árbol), lotes, existencias, movimientos (entrada, salida, ajuste, traslado, consumo), mínimo, alerta, vencimiento.
- Fuera: compras y proveedores (F, R06), costeo e informe F-983 (F, R22), farmacia y dispensación (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-111-01 | El sistema debe registrar artículos con tipo (insumo, reactivo, equipo menor), unidad y mínimo. | R | REQ-HAB-05; D-057 |
| FR-111-02 | El sistema debe llevar existencias por bodega y lote con fecha de vencimiento. | R | D-057 |
| FR-111-03 | Todo cambio de existencia debe ser un movimiento con tipo, cantidad, motivo, autor e instante. | R | RN-36 |
| FR-111-04 | Si un movimiento dejaría una existencia negativa, entonces el sistema debe rechazarlo, también con movimientos simultáneos. | R | RN-36; D-063 |
| FR-111-05 | Si se intenta usar un lote vencido, entonces el sistema debe rechazarlo. | R | RN-37 |
| FR-111-06 | Cuando una existencia baja del mínimo, el sistema debe avisar en vivo al Jefe de Operaciones y, si es reactivo, al laboratorio. | R | RN-37 |
| FR-111-07 | Enfermería debe registrar consumo de insumos asociado opcionalmente a un paciente; el laboratorio, consumo de reactivos. | E | D-057 |
| FR-111-08 | El sistema debe mostrar el historial de movimientos de un artículo. | R | RN-36 |

## Escenarios de aceptación

1. **Sin negativos.** Dadas 5 unidades, cuando dos personas sacan 4 a la vez, entonces una salida pasa y la otra se rechaza.
2. **Mínimo.** Dado un mínimo de 10 y 11 unidades, cuando se consumen 2, entonces aparece la alerta en el tablero del Jefe de Operaciones.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-36, RN-37. Datos: `ARTICULO`, `LOTE`, `EXISTENCIA`, `MOVIMIENTO`.
- Endpoints: spec 111. Pantallas: W22, W23, A53.

## Preguntas abiertas
Ninguna.
