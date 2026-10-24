# 112. Información pública y avisos

**Estado:** En revisión · **Semanas:** S3 · **Depende de:** 103, 104, 105 · **Investigación:** REQ-PRV-01; LPDP (minimización)

## Objetivo

La cara pública del hospital: estado general de ocupación, médicos de turno y avisos generales, en una pantalla sin sesión (televisor de sala de espera o página pública) y en las apps, siempre en vivo y nunca con datos personales.

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-112-01 | El sistema debe publicar sin sesión la ocupación por planta y tipo (camas libres de total), sin identificar camas ni pacientes. | R | REQ-PRV-01 |
| FR-112-02 | El sistema debe publicar sin sesión los médicos de turno con nombre, especialidad y área. | R | REQ-PRV-01; RN-17 |
| FR-112-03 | El Jefe de Operaciones debe publicar y retirar avisos generales con vigencia. | R | REQ-PRV-01 |
| FR-112-04 | La información pública debe actualizarse en vivo en la pantalla pública y en las apps. | R | REQ-PLT-06 |
| FR-112-05 | Si un aviso contiene un DUI, número de expediente o teléfono, entonces el sistema debe advertir antes de publicarlo. | E | LPDP |
| FR-112-06 | La pantalla pública debe mostrar los números de fila llamados con su consultorio, sin nombres. | E | FR-105-11 |

## Escenarios de aceptación

1. **Sin datos personales.** Dada la pantalla pública abierta sin sesión, cuando se asigna una cama, entonces solo cambia el conteo de la planta.
2. **Aviso.** Dado un aviso "Laboratorio cerrado el domingo", cuando se publica, entonces aparece en la pantalla pública y en las apps sin recargar, y desaparece al vencer.

## Reglas, datos, endpoints y pantallas
- Datos: `AVISO`, vistas agregadas de ocupación y turnos. Endpoints: spec 112 (públicos). Pantallas: W25, W34, A10, I10.

## Preguntas abiertas
Ninguna.
