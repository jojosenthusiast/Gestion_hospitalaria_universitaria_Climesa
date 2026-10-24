# 107. Plan

## Backend
Módulo `Laboratorio`. Consume `consulta.orden_laboratorio_creada` del outbox y crea la orden con su expansión recursiva (CTE con arreglo de ruta para cortar ciclos). Máquina de estados en dominio. Cálculo de marca con el rango vigente según sexo y edad del paciente a la fecha de la muestra (dato pedido al módulo Pacientes por contrato).

## Base de datos
`0007_laboratorio.sql`: `examen`, `examen_componente` (disparador que rechaza ciclos), `rango_referencia` (exclusión por examen, sexo, edad y vigencia), `orden_lab`, `orden_item`, `resultado`, `resultado_historial`. Semilla del catálogo.

## Eventos de tiempo real
`lab.orden_creada`, `lab.estado_cambiado`, `lab.valor_critico` (push al médico), `lab.revisado` (push al paciente).

## Clientes
Web y Android para el laboratorista con columnas por estado; médico con "por revisar" y críticos arriba; paciente con estado y valores tras revisión.

## Pruebas
Expansión recursiva y ciclo rechazado, transiciones, marcas por rango y edad, crítico emite evento, paciente no ve valores antes de revisión.

## Riesgos
Rangos de referencia de la semilla son ilustrativos; se rotulan "solo para demostración".
