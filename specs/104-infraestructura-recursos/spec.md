# 104. Edificio, camas y recursos

**Estado:** En revisión · **Semanas:** S1, S2, S4 · **Depende de:** 100 · **Investigación:** R03 (camas, limpieza); R06; legado spec 002 FR-017 a FR-019; D-055, D-057, D-062

## Objetivo

El hospital como árbol configurable (edificio, plantas, áreas, habitaciones, camas, consultorios) con la estructura exacta del curso, tablero de camas en tiempo real, ciclo de limpieza y equipo médico por espacio.

## Alcance
- Dentro: árbol de espacios y su edición, capacidad por habitación, estados de cama, bloqueo, limpieza con verificación de otra persona, equipo médico y su estado, consultas recursivas, semilla del curso.
- Fuera: ocupación y asignación (spec 108), inventario de insumos (spec 111), mantenimiento preventivo programado (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-104-01 | El sistema debe representar el hospital como un árbol de espacios (hospital, planta, área, habitación, cama, consultorio, cubículo, bodega, bahía) con padre único. | R | REQ-HAB-07; D-062 |
| FR-104-02 | La semilla debe crear la planta 3 con VIP-301 a VIP-305 de 1 cama, la planta 2 con HAB-201 a HAB-206 de 2 camas (12 camas) y la planta 1 de D-055. | R | REQ-HAB-01, 02, REQ-HAB-06; D-055 |
| FR-104-03 | Si se intenta tener en una habitación más camas activas que su capacidad, entonces el sistema debe rechazarlo. | R | REQ-HAB-03 |
| FR-104-04 | Si se intenta reducir la capacidad de una habitación ocupada por debajo de sus camas ocupadas, entonces el sistema debe rechazarlo. | R | REQ-HAB-03 |
| FR-104-05 | El sistema debe calcular disponibilidad por nodo del árbol (planta, habitación) con una consulta recursiva. | R | D-062; ADR-0007 |
| FR-104-06 | El sistema debe mostrar el estado de cada cama: libre, reservada, ocupada, en limpieza, bloqueada. | R | RN-03 |
| FR-104-07 | Cuando cambia el estado de una cama, todos los tableros abiertos deben actualizarse sin recargar. | R | REQ-PLT-06 |
| FR-104-08 | El tablero debe mostrar el ocupante solo a quien tenga `camas.ver_ocupante`; a los demás, iniciales. | R | REQ-PRV-02 |
| FR-104-09 | El Jefe de Operaciones debe poder bloquear y desbloquear una cama libre con motivo. | R | RN-03 |
| FR-104-10 | Cuando se registra la salida física de un paciente, la cama debe pasar a "en limpieza". | R | RN-04 |
| FR-104-11 | Cuando una persona verifica la limpieza registrada por otra, la cama debe pasar a "libre". Si es la misma persona, se rechaza. | R | RN-04; D-013 |
| FR-104-12 | El sistema debe registrar equipo médico por espacio con estado operativo o en mantenimiento. | E | D-057 |
| FR-104-13 | El sistema debe mostrar la ruta completa de un espacio ("Planta 2 > HAB-203 > Cama B"). | R | D-062 |

## Escenarios de aceptación

1. **Capacidad.** Dada HAB-201 con 2 camas, cuando se intenta agregar una tercera, entonces se rechaza.
2. **Recursivo.** Dadas 3 camas ocupadas en planta 2, cuando se consulta el árbol, entonces la planta muestra 9 de 12 libres y cada habitación su conteo.
3. **Limpieza.** Dada una cama en limpieza registrada por Luis, cuando Luis intenta verificarla, entonces se rechaza; cuando la verifica Marta, queda libre y el tablero cambia en vivo.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-01 a RN-04. Datos: `ESPACIO`, `LIMPIEZA_CAMA`, `BLOQUEO_CAMA`, `EQUIPO`.
- Endpoints: spec 104. Pantallas: W09, W12, W24, A35, A52.

## Preguntas abiertas
Ninguna.
