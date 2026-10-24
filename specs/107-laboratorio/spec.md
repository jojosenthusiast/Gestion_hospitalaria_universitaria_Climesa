# 107. Laboratorio

**Estado:** En revisión · **Semanas:** S3, S4 · **Depende de:** 106 · **Investigación:** R07 (estados, valores críticos, validación); D-039, D-040, D-043, D-059, D-062

## Objetivo

Módulo de resultados con estados Pendiente, En Proceso y Completado (curso), con valores y rangos de referencia, aviso de valores críticos y liberación al paciente solo después de la revisión médica.

## Alcance
- Dentro: catálogo de exámenes y paneles (árbol), rangos por sexo y edad con vigencia, cola, toma de muestra, captura, completar, cancelar, revisión médica, valores críticos, vista del paciente.
- Fuera: interfaz con equipos analizadores (F), control de calidad del laboratorio (F), laboratorio externo (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-107-01 | El sistema debe mantener un catálogo de exámenes con unidad y de paneles que contienen exámenes u otros paneles, sin ciclos. | R | D-062; RN-27 |
| FR-107-02 | Cuando se crea una orden con paneles, el sistema debe expandirla recursivamente a sus exámenes hoja. | R | RN-27 |
| FR-107-03 | El sistema debe mantener rangos de referencia y rangos críticos por examen, sexo y edad, con vigencia. | R | D-039; RN-25 |
| FR-107-04 | Toda orden nueva debe quedar Pendiente y aparecer en la cola del laboratorio en vivo. | R | REQ-LAB-01 |
| FR-107-05 | Cuando el laboratorista registra la toma de muestra con doble identificación del paciente, la orden debe pasar a En Proceso. | R | REQ-LAB-01; R07 |
| FR-107-06 | El sistema debe validar que cada valor tenga unidad correcta y marcarlo normal, alto, bajo o crítico según el rango vigente a la fecha de la muestra. | R | RN-25 |
| FR-107-07 | Cuando todos los exámenes tienen valor, el laboratorista debe poder completar la orden, que pasa a Completado. | R | REQ-LAB-01 |
| FR-107-08 | Si un valor es crítico, entonces el sistema debe avisar al médico solicitante en tiempo real y por push en el momento de capturarlo. | E | D-059; R07 |
| FR-107-09 | El sistema debe permitir cancelar una orden Pendiente o En Proceso con motivo. | R | D-059 |
| FR-107-10 | El médico tratante debe marcar como revisada una orden Completado; solo entonces el paciente ve los valores. | R | D-040; RN-26 |
| FR-107-11 | El paciente debe ver siempre el estado de sus órdenes, en vivo. | R | REQ-ROL-04 |
| FR-107-12 | Si se corrige un valor de una orden Completado, entonces el sistema debe conservar el valor anterior y avisar al médico. | E | D-003; R07 |
| FR-107-13 | Las transiciones deben ser solo Pendiente → En Proceso → Completado, y Pendiente o En Proceso → Cancelado. | R | REQ-LAB-01 |

## Escenarios de aceptación

1. **Ciclo completo.** Dada una orden de hemograma Pendiente, cuando se toma la muestra, se capturan los valores y se completa, entonces el paciente ve "Completado" sin valores; cuando el médico revisa, el paciente ve los valores con sus rangos.
2. **Crítico.** Dado potasio 6.8 mmol/L con crítico alto 6.0, cuando se captura, entonces el médico recibe aviso inmediato.
3. **Panel recursivo.** Dado el panel "Perfil prenatal" que contiene "Hemograma" (panel) y "Glucosa", cuando se ordena, entonces la orden tiene todos los exámenes hoja una sola vez.
4. **Transición inválida.** Dada una orden Completado, cuando se intenta volver a En Proceso, entonces se rechaza.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-24 a RN-27. Datos: `EXAMEN`, `EXAMEN_COMPONENTE`, `RANGO_REFERENCIA`, `ORDEN_LAB`, `RESULTADO`.
- Endpoints: spec 107. Pantallas: W10, W20, W21, A60 a A62, A23, I23, A07, I07.

## Preguntas abiertas
Ninguna. Catálogo mínimo de la semilla: hemograma (panel), química básica (glucosa, creatinina, urea, potasio, sodio), examen general de orina (panel), perfil lipídico (panel), prueba de embarazo, con rangos tomados de referencias publicadas y marcados como ficticios para el curso.
