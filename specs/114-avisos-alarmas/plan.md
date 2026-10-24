# 114. Plan

## Backend
Tabla `plataforma.aviso` (evento, nivel, destinatario, creado, confirmado_por, confirmado_en, escalado_en) alimentada desde el outbox; trabajo que escala críticos sin confirmar; endpoint `POST /api/v1/avisos/{id}/confirmar`. El catálogo de niveles es una política con vigencia (`avisos.niveles`).

## Clientes
Un componente de aviso compartido por plataforma (web: capa sobre la app; Android: actividad de pantalla completa o diálogo; iOS: vista modal a pantalla completa), con sonidos incluidos en la app. La franja urgente vive en la barra superior.

## Pruebas
Escenarios 1 a 3; prueba de escalamiento con reloj controlado; revisión de "reducir movimiento".

## Riesgos
Alertas críticas de iOS requieren aprobación manual de Apple: no se cuenta con ellas para la defensa.
