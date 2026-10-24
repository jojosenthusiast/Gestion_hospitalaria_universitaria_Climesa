# Estado y decisiones candidatas
## Evidencia estática
AdmissionService.CreateAsync verifica paciente activo, ausencia de ingreso activo y cama Available antes de comenzar transacción; después crea Admission y cambia cama a Occupied. La comprobación previa no demuestra exclusión entre dos solicitudes concurrentes: falta probar constraints/aislamiento y comportamiento real.
DischargeAsync verifica fechas, registra DischargedAt y cambia cama directamente a Available. No se observó un paso de limpieza/inspección dentro de ese método. Esto es brecha concreta del prototipo, no prueba de que CLIMESA omita limpieza.
ClinicalEntities.cs contiene Bed/Admission/Consultation/VitalSign y prescripciones generales. Los términos de entidades especializadas buscados se documentan en evidencia_codigo.json. Una búsqueda sin coincidencias no acredita ausencia de funcionalidad equivalente o servicios externos.

## Brechas B701–707
| ID | Evidencia/modelo insuficiente | Operación que necesita especificación |
|---|---|---|
| B701 | Cama con estado general | Reserva, traslado, limpieza, bloqueo y capacidad habilitada. |
| B702 | Admission ligado a una cama | Historial de ubicación y movimientos sin perder episodio. |
| B703 | Registro de signos/consulta genérico | Plan enfermero, tareas, reevaluación, relevo y escalamiento. |
| B704 | Sin entidad específica UCI encontrada | Dispositivos, infusiones, calidad de señales y revisión multidisciplinaria. |
| B705 | Sin órdenes/ingesta nutricional específicas encontradas | Dieta efectiva, alergias, producción, entrega y evaluación. |
| B706 | Alta básica | Conciliación, educación, destino y pendientes postalta. |
| B707 | Sin entidades de apoyo específicas encontradas | Custodia textil/residuos, mantenimientos y verificación de liberación. |

## Decisiones propuestas D701–712
1. Ubicación física, episodio clínico, disponibilidad sanitaria y capacidad operativa son registros distintos.
2. Asignación y traslado guardan intervalos sin superponer ocupaciones incompatibles; capacidad disponible depende de personal/equipo/habilitación y aislamiento.
3. Alta clínica, salida física y cierre financiero son hechos separados; no convertir deuda en decisión clínica automática.
4. Plan de cuidados versionado: necesidad/objetivo, intervención, ejecución/evidencia, evaluación y actualización.
5. Eventos clínicos y alertas preservan entrega, acuse, valoración y acción; falta de datos no equivale a normalidad.
6. UCI es circuito especializado sujeto a servicio real y capacidad, no una etiqueta de cama.
7. Medición, orden, configuración de dispositivo y administración real son diferentes.
8. Dieta es orden efectiva con restricciones justificadas y responsable; ingesta documentada puede diferir de lo producido.
9. Residuos/textiles son custodia por lote/contenedor/carga, con agregación operacional apropiada; evitar asociarlos a pacientes sin necesidad.
10. Activo biomédico tiene historial técnico y estado autorizado de uso, diferente del asiento contable.
11. Autorización de reglas por responsables, versión/fecha de vigencia y rollback; automatización no prescribe ni diagnostica por plantilla.
12. Todo pendiente tras alta o transferencia conserva responsable y fecha de revisión hasta cierre verificable.

Estas decisiones no son migraciones aprobadas. Mantener límites MVC/service/data y gobernanza del repositorio al convertirlas en especificaciones técnicas.
