# Marco de decisión técnica: aún no seleccionar ganador
La auditoría estática del prototipo sirve para localizar brechas, no para calcular capacidadreal, costo oseguridad probada. La decisión debe hacerse por circuito ycomponentes, pudiendo conservar unas partes yreemplazar otras.

| Opción | Evidencia para evaluarla | Señal que requiere trabajo adicional |
|---|---|---|
| Continuar base .NET | Modelo/servicios ypermisos admiten estados, autoría, concurrencia ypruebas; soporte del stack yoperación disponibles. | CRUD genérico confundido con circuito, esquema que obliga a sobrescribir historia. |
| Refactorizar componentes | Dependencias claras, contratos aprobados, pruebas relevantes yplan de migración reversible. | Cambio masivo sin reconciliar identidad/cargos/resultados ni actos encurso. |
| Reconstruir núcleo | Casos bloqueantes documentados, coste de transición, coexistencia/corte/rollback ycapacidad de mantenerlo. | Decisión estética/tecnológica sin evidencia, pérdida de histórico yoperación durante corte. |
| Integrar especializado | LIS/PACS/ERP/uotros validados contra servicios/equipos/legislación/soporte/exportación/costos. | Publicidad tomada por conformance olicencia/interopreproducción no verificada. |

## Expediente de comparación por dominio
Requisitos aplicables, funciones confirmadas, gap código/evidencia, opciones/versiones/licencias, cobertura decasos ordinarios/excepciones, pruebas técnicas/operativas, migración/custodia, soporte24h cuando necesario, infraestructura/seguridad ycoste total. Los puntajes/pesos se acuerdan con autoridad; no inventar ranking numérico.

## Entrega vertical candidata
Después de confirmaciones, seleccionar circuito pequeño pero completo: identidad/episodio → orden/prestación → registro validado → cargo/origen → pago/conciliación → seguimiento. Validar con dueños, límites yexcepciones reales. No elegir laboratorio/medicación de alto riesgo como primer piloto solo por interés tecnológico.
Despliegue requiere entorno aprobado, permisos, datos autorizados, formación, continuidad, backup/restore ycriterios de salida. Ninguna migración se aplica con esta investigación.

## Resultado actual
Sin decisión aprobada de continuar/refactorizar/reconstruir. La siguiente inversión investigativa debe cerrar clase/servicios, textosprioritarios yaceptación funcional. Usar matriz para separar hechosnormativos/operativos detécnicos ypriorizar evidencia que realmente cambia la decisión.
