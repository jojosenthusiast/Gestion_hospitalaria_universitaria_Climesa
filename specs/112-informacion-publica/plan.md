# 112. Plan

## Backend
Módulo `Publico` de solo lectura con caché de 5 s, invalidada por eventos. Endpoints sin autenticación, con límite de solicitudes por IP.

## Base de datos
`0012_publico.sql`: `aviso`; vistas `v_ocupacion_publica` (desde `infra.v_estado_cama` por planta y categoría) y `v_medicos_de_turno` (desde la vista publicada de personal).

## Eventos de tiempo real
Canal `publico`: `cama.estado_cambiado` (agregado), `turno.publicado`, `aviso.publicado`, `fila.llamado`.

## Clientes
Ruta `/publico` en la web en modo televisor (letras grandes, sin interacción); sección "Información del hospital" en las apps.

## Pruebas
La respuesta pública no contiene ningún campo de la lista personal o clínica de `privacidad.md` (prueba automática sobre el JSON).

## Riesgos
Ninguno.
