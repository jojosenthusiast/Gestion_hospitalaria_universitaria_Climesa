# 102. Plan

## Backend
Módulo `Pacientes`, portado del módulo `Identity` del legado: claves fonéticas en español, dígito del DUI (pesos 9 a 2, módulo 10), expediente ISO 7064 MOD 11-2, búsqueda con `pg_trgm` y claves fonéticas. Cambios: textos y códigos de error en español, filtrado de campos por permiso.

## Base de datos
`0003_pacientes.sql`: `pacientes.paciente`, `identificador` (índice único parcial para DUI activo), `historial_demografico` (solo inserción), `caso_duplicado`, `busqueda_reciente` (para FR-102-02).

## Eventos de tiempo real
`paciente.registrado` (rol REC), `paciente.actualizado` (paciente propio y equipo tratante).

## Clientes
Búsqueda con motivo visible; formulario de registro que solo se habilita tras buscar; ficha con campos según permiso.

## Pruebas
Portar las 10 pruebas de identidad del legado; agregar filtrado de campos por rol y concurrencia del DUI.

## Riesgos
Ninguno nuevo; el dominio ya está probado en el legado.
