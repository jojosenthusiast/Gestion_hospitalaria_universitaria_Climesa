# 102. Pacientes

**Estado:** En revisión · **Semanas:** S2, S3, S4 · **Depende de:** 100, 101 · **Investigación:** R01; legado spec 001 (FR-001 a FR-043); V3 ID01 a ID06, AC301 a AC312; Norma 1616 Art. 11, 14-15, 42

## Objetivo

CRUD de pacientes exigido en el avance, hecho de la forma robusta: buscar antes de crear, identificadores salvadoreños validados, identidad provisional sin datos inventados, correcciones con historial y nunca fusiones automáticas.

## Alcance
- Dentro: búsqueda fonética con motivo de coincidencia, registro, ficha, edición con historial, inactivación, identidad provisional (NN), identificadores (DUI, pasaporte, NUI, carné de minoridad), casos de posible duplicado.
- Fuera: fusión y separación supervisada (F, legado 001 FR-026 a FR-034), migración de papel (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-102-01 | Cuando se busca un paciente por nombre, DUI o expediente, el sistema debe devolver candidatos con el motivo de coincidencia (fonético, documento, fecha) y solo los campos mínimos. | R | D-011; legado 001 FR-002 |
| FR-102-02 | Si se intenta registrar un paciente sin una búsqueda previa de los últimos 10 minutos con esos datos, entonces el sistema debe rechazarlo. | R | D-011 |
| FR-102-03 | Cuando se registra un DUI, el sistema debe validar su dígito verificador y rechazar uno ya asignado a otro paciente activo, indicando el expediente que lo tiene. | R | legado 001 FR-009, FR-010 |
| FR-102-04 | El sistema debe asignar un número de expediente único con dígito verificador ISO 7064. | R | legado 001 FR-043; Norma 1616 Art. 11 |
| FR-102-05 | Cuando se registra un paciente sin identidad confirmada, el sistema debe crear una identidad provisional con sexo, edad estimada y señas, marcando la fecha de nacimiento como estimada. | R | D-004; legado 001 FR-014 a FR-016 |
| FR-102-06 | Cuando se corrigen datos personales, el sistema debe conservar la versión anterior con autor, motivo e instante. | R | D-003; Norma 1616 Art. 42 |
| FR-102-07 | Si una edición llega con una versión desactualizada, entonces el sistema debe rechazarla con 409. | R | D-007 |
| FR-102-08 | Cuando se inactiva un paciente, el sistema debe conservar todo su historial y seguir mostrándolo a quien tenga permiso. | R | REQ Aldara 3.1; D-003 |
| FR-102-09 | Cuando dos registros se parecen al registrar, el sistema debe abrir un caso de posible duplicado y no fusionarlos. | E | D-006; legado 001 FR-027 |
| FR-102-10 | El sistema debe filtrar los campos de la ficha según permiso y contexto (privacidad, sección 2). | R | REQ-PRV-02 |
| FR-102-11 | Toda búsqueda y lectura de ficha debe quedar auditada, guardando un hash del texto buscado. | R | D-009; legado 001 FR-038 |
| FR-102-12 | Cuando dos personas registran el mismo DUI al mismo tiempo, el sistema debe crear un solo paciente. | R | legado 001 FR-010; D-063 |

## Escenarios de aceptación

1. **Búsqueda fonética.** Dado "José Hernández Vásquez", cuando se busca "hernandes basquez jose", entonces aparece con motivo "coincidencia fonética".
2. **DUI repetido.** Dado un DUI ya asignado, cuando se registra otro paciente con ese DUI, entonces se rechaza indicando el expediente existente.
3. **NN en ambulancia.** Dado un paciente inconsciente, cuando el paramédico lo registra, entonces existe "NN-2026-…" con edad estimada y sin fecha exacta inventada.
4. **Corrección.** Dado un apellido mal escrito, cuando recepción lo corrige con motivo, entonces el historial muestra ambos valores.

## Reglas, datos, endpoints y pantallas
- Datos: `PACIENTE`, `IDENTIFICADOR`, `HISTORIAL_DEMOGRAFICO`, `CASO_DUPLICADO`.
- Endpoints: spec 102 en la matriz RBAC.
- Pantallas: W26, A30, A73, I03 y A03 (vinculación).

## Preguntas abiertas
Ninguna.
