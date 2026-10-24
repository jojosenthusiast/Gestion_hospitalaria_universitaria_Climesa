# CLIMESA — iteración 3: identidad, atenciones y circuito de ingresos
12/10/2026. Investigación y especificaciones candidatas; aplicación sin cambios.

## Avance de esta entrega
Esta iteración desarrolla contratos de identidad/archivo, atención/continuidad y finanzas hospitalarias. Añade estados, permisos, comandos, datos, concurrencia, fallos y criterios de aceptación. La documentación pública se contrasta con el código; no se presenta como procedimiento interno confirmado.

El antecedente_v2 incluido contiene también el dossier v1. Se mantienen las decisiones anteriores, salvo las precisiones de esta iteración. Leer 01–04 para el modelo; 05–07 para tareas, adopción y evidencia.

## Precisiones que afectan el diseño desde el inicio
- Identificador interno estable, identificadores externos tipados y estado de verificación.
- La fusión de identidades requiere reconciliar referencias y comunicar a consumidores; no equivale a UPDATE PatientId.
- Separar cita, atención, periodo de cuidado, hospitalización física y cuenta económica.
- Estado administrativo del paciente no debe reemplazar estado de identidad, fallecimiento, autorización o situación clínica.
- Contacto de emergencia, representante, titular de seguro y pagador son relaciones distintas.
- Cobro, aplicación de cobro a deuda y conciliación bancaria son operaciones separadas.
- Política de reconocimiento económico y documento fiscal se modelan con tiempos/estados independientes.

## Madurez
Hay evidencia suficiente para justificar nuevas separaciones de dominio. Falta evidencia para elegir reescritura completa, aprobar SOP CLIMESA o conectar productos.
Ningún test operativo adjunto figura como ejecutado; son criterios de aceptación futuros.
Continúan pendientes el Decreto 659 completo, reglas fiscales consolidadas, contratos de aseguradoras, políticas contables y documentos internos. Se detalla el nivel de acceso en 07 y no se fabrican plazos ni tasas.

## Continuación definida
Completar compras/CxP/valoración y circuito orden-farmacia-enfermería, usando identidad/atención/cargo como contratos comunes. Laboratorio y resultados deben enlazar estas identidades y sostener la continuidad después del alta.

