# 111. Plan

## Backend
Módulo `Inventario`. Movimiento: `UPDATE existencia SET cantidad = cantidad - $1 WHERE ... AND cantidad >= $1` (una sola sentencia atómica) más el registro del movimiento; si no actualiza filas, rechazo.

## Base de datos
`0011_inventario.sql`: `articulo`, `lote`, `existencia` (CHECK cantidad mayor o igual a 0), `movimiento`. Semilla de 20 artículos ficticios.

## Eventos de tiempo real
`inventario.bajo_minimo`, `inventario.movimiento`.

## Clientes
Tabla con alertas en web; formulario de consumo en Android.

## Pruebas
Salidas concurrentes, lote vencido, alerta de mínimo.

## Riesgos
Ninguno.
