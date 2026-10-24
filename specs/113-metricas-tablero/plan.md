# 113. Plan

## Backend
Módulo `Metricas` de solo lectura sobre vistas publicadas por cada módulo (`v_...`). Indicadores con consultas agregadas; caché de 10 s invalidada por eventos.

## Base de datos
`0013_metricas.sql`: vistas agregadas; sin tablas propias en el curso.

## Eventos de tiempo real
Escucha eventos de otros módulos y emite `metricas.recalculadas` a ADM y JOP.

## Clientes
Web: tarjetas con número grande, barra por planta y tendencia simple; bandejas por rol.

## Pruebas
Prueba de ausencia de datos personales; escenario 1 en la prueba de integración de punta a punta.

## Riesgos
Para el avance solo existen camas, turnos y pacientes: las demás tarjetas usan FR-113-06.
