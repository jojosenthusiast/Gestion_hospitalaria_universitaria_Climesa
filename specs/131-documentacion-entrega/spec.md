# 131. Documentación y entrega

**Estado:** En revisión · **Semanas:** S2, S5, S6 · **Depende de:** todas · **Investigación:** documento del curso, sección 4

## Objetivo

Todo lo que se entrega además del código: README, documento de arquitectura en PDF, enlace a Figma y guion de la defensa (20% de documentación y repositorio y 20% de defensa en vivo).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-131-01 | El README raíz debe explicar instalación, variables de entorno y ejecución de backend, web, Android e iOS. | R | entregable 3 |
| FR-131-02 | El documento de arquitectura en PDF debe incluir diagrama de arquitectura, diagrama de base de datos, matriz RBAC y política de privacidad, generado desde `docs/arquitectura`. | R | entregable 2 |
| FR-131-03 | El documento debe incluir el enlace al prototipo de Figma y su sistema de diseño. | R | entregable 1 |
| FR-131-04 | Debe existir un guion de defensa con flujos sincrónicos entre pacientes (iOS y Android) y administradores (web), con datos semilla preparados. | R | criterio de defensa |
| FR-131-05 | Debe existir un procedimiento para restaurar el entorno `demo` desde las semillas en un comando. | R | ADR-0006 |
| FR-131-06 | El documento de arquitectura debe incluir las decisiones (ADR) y la trazabilidad requisito, spec, prueba. | E | constitución 6 |

## Escenarios de aceptación
1. **Instalación desde cero.** Dada una máquina limpia, cuando un compañero sigue el README, entonces levanta las tres plataformas contra el entorno `demo`.
