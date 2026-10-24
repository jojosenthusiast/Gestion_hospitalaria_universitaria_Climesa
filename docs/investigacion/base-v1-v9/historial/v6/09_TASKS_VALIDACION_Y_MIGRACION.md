# Tasks y evidencia de aceptación

IDs T601–620: candidatas no completadas. Sin owners nominales, fechas o estimaciones inventadas. Cada tarea exige validación del dueño clínico/operativo y responsable técnico.

| Task | Entrega | Dependencias/flujo | Criterios |
|---|---|---|---|
| T601 | Identidad y episodio de emergencia | T301–304; EMG01 | AC601–603 |
| T602 | Triaje y reevaluación | T601; EMG02 | AC604–606 |
| T603 | Observación, órdenes y relevo | T602; T502–514; EMG03 | AC607–609 |
| T604 | Disposición y transferencia | T603; EMG04–06 | AC610–612 |
| T605 | Caso quirúrgico y consentimiento | T304; SUR01 | AC613–615 |
| T606 | Agenda y capacidad perioperatoria | T605; SUR02 | AC616–618 |
| T607 | Pausas y discrepancias quirúrgicas | T605–606; SUR03 | AC619–621 |
| T608 | Conteos, implantes y muestras | T607; T403–405/T503; SUR04–05 | AC622–624 |
| T609 | Evaluación anestésica y equipo | T605–606; ANE01–02 | AC625–627 |
| T610 | Registro anestésico y relevo | T609; T410–412; ANE03 | AC628–630 |
| T611 | Recuperación y salida | T610; ANE04–05 | AC631–633 |
| T612 | CEYE recepción, limpieza e inspección | T403–405; STE01 | AC634–636 |
| T613 | Carga, paquete y liberación | T612; STE02–03 | AC637–639 |
| T614 | CEYE uso, retiro y capacidad | T613; T608; STE03–05 | AC640–642 |
| T615 | Unidad transfusional, recepción y reserva | T301/T403; TRF02–03 | AC643–645 |
| T616 | Solicitud, muestra, derechos y liberación | T615; T503–507; TRF01–02 | AC646–648 |
| T617 | Administración transfusional y reacción | T616; TRF04 | AC649–651 |
| T618 | Destino final, devolución y hemovigilancia | T617; TRF05 | AC652–654 |
| T619 | Cargos, costes y conciliación | T305–310/T413; FIN601 | AC655–657 |
| T620 | Interfaces, contingencia y migración | T601–619; T516; CON601/GOV601 | AC658–660 |

## Alcance de pruebas
Los 60 criterios del CSV son requisitos pendientes, no pruebas ejecutadas. Cada uno necesita concretar dataset aprobado/desidentificado, precondiciones de estado/privilegios/version, pasos, resultado esperado y evidencia. No usar pacientes reales ni credenciales en el dossier.
Escenarios técnicos con fixtures sirven para estados/concurrencia/interfaz, pero no acreditan competencia clínica, custodia física, participación verbal, autorizaciones o operación institucional. La aceptación requiere observación/evidencia del proceso real, no una demo.

## Validación de campo y políticas a resolver
| Grupo | Evidencia institucional a conseguir | Caso que permite revisar excepciones |
|---|---|---|
| Emergencias | Triaje usado, cobertura, reevaluación, interconsultas, acuerdos de traslado y formularios de contingencia. | Paciente provisional, deterioro en espera, destino sin cama, relevo o transporte fallido. |
| Quirófano | Procedimientos autorizados, agenda, limpieza, consentimiento, privilegios y reglas de conteos/implantes. | Urgente desplaza electivo, falta instrumental, revocación, discrepancia o muestra pendiente. |
| Anestesia | Permisos, roles/supervisión, equipos/monitor, hojas y criterios de traslado/alta. | Relevo, dato inválido, cambio de plan o necesidad de cuidados críticos. |
| CEYE | Documento 2026, fabricantes/SOP, zonas, cargas/indicadores, cuarentena y registro de uso. | Ciclo incompleto, paquete comprometido, retiro después de usar en un paciente. |
| Transfusión | Modalidad del servicio, permisos, proveedor/convenio, compatibilidad, custodia, rechazo y hemovigilancia. | Unidad urgente con prueba pendiente, identidad discordante, reacción o devolución no apta. |
| Finanzas/TI/calidad | Contratos/catálogo/costos, reglas de excepción, interfaces, respaldo y conciliación. | Cargo repetido, falta de conectividad o restauración posterior a actos físicos. |

Documentar observado, responsable, documento vigente y decisión aprobada. No atribuir incidentes al hospital sin observación. Confirmar servicios tercerizados y obligaciones de intercambio antes de crear módulos internos.

## Migración y corte
Inventario real de sistemas/documentos por servicio; fuentes/autores/versiones/IDs y calidad. Formularios históricos escaneados quedan documentos, sin inferir automáticamente tiempos, dosis o compatibilidad. Importación de datos estructurados requiere mapping revisado y estados inequívocos.
Corte debe enumerar pacientes en emergencia/observación, cirugías agendadas/en ejecución, recuperación, cargas pendientes/cuarentena, retiros abiertos, unidades reservadas/entregadas sin destino y reacciones en investigación. Asignar responsable por obligación abierta. Conciliar cantidades y vínculos; verificar documentos recuperables y duplicados. Rollback conserva actos nuevos y avisos externos ya emitidos.

## Orden de implementación propuesto
Primero identidad/episodios/privilegios y continuidad de v3–v5; después grupo del servicio realmente prestado con dueño y protocolos; luego integración financiera y optimización. No construir simultáneamente módulos clínicos de alto riesgo sin política/evidencia/soporte. Las dependencias referencian tareas previas candidatas, no completadas.

## Próxima investigación propuesta
Hospitalización, enfermería, cuidados críticos, nutrición y continuidad del alta; apoyo con limpieza/ropa/residuos/mantenimiento biomédico, seguido de RRHH/credenciales, calidad y consolidación de mapa completo. Confirmar cada servicio y modalidad. Después comparar continuar/refactorizar/reconstruir con trazabilidad de requisitos, costos, migración y capacidad operativa; no decidir por contar pantallas existentes.
