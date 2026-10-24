# R21. Quejas, derechos de los pacientes y solicitudes de datos

**Versión:** 1 (2026-10-13). **Alimenta:** spec 005 (expediente: acceso, copia, rectificación), módulo de quejas, calidad (R18).

## 1. Conclusión

V8-05 (CMP01-CMP04) separa bien queja, incidente clínico, solicitud de datos y litigio. Se conserva. Lo que faltaba eran plazos, y ahora están:

- **El Reglamento de la LDDPPSS (Art. 9) obliga a hospitales y clínicas a tener una oficina de reclamos** y formularios de sugerencias, consultas, quejas y reclamos, con tres prioridades: servicios urgentes de salud, de inmediato o al día siguiente si no hay riesgo; violación de derechos del paciente, 3 a 5 días según complejidad; lo demás, máximo 15 días. La respuesta es por escrito (LDDPPSS Art. 21). **No resolver un reclamo, expresa o tácitamente, es infracción** (Art. 44 d).
- **El paciente tiene tres vías externas además de la interna:** la Oficina Tramitadora de Denuncias del CSSP (Art. 8, 50-53, con plazos en días hábiles), la Defensoría del Consumidor por cobros (la Ley de Protección al Consumidor prohíbe cobrar servicios no prestados o no autorizados y exigir pagarés en blanco) y la vía judicial. El expediente de la queja tiene que servir para las tres.
- **Solicitudes de datos (LPDP):** 20 días hábiles (Art. 20). El acceso y copia del expediente clínico se rigen por la norma de expediente reformada (Acuerdo 698, Art. 41-42), ya en R01.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V8 CMP01 | Canales accesibles, identidad cuando hace falta, riesgo inmediato activa atención sin esperar trámite; representante de queja no recibe expediente completo por eso | Se conserva; plazos ya no son "por confirmar" |
| V8 CMP02 | Acuse, asignación imparcial, respuesta versionada; el expediente no se modifica para coincidir con la respuesta; descuento no elimina incidente | Se conserva |
| V8 CMP03 | Preservación por controversia con objeto, motivo y revisión; extracción con hash | Se conserva |
| V8 CMP04 | Solicitud de datos con titular, representación, derecho, plazo; sin botón "borrar todo"; rectificación de datos personales distinta de cambio clínico | Se conserva |
| V8 DOC03 | Tabla de conservación por serie; vencimiento no destruye automáticamente | Se conserva |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| "Plazos según reglamento, por consultar" | Cerrado: Reglamento LDDPPSS Art. 9 (24 h urgente, 3-5 días derechos, 15 días resto) |
| "La LDDPPSS da derecho a copia con plazo" | La ley no fija plazo de copia; lo trae la norma de expediente (R01). No mezclar |
| Queja anónima sin trámite | Se registra y alimenta calidad, pero no recibe información clínica |

## 4. Marco legal verificado

| Norma | Regla | Regla del sistema | Estado |
|---|---|---|---|
| LDDPPSS Art. 21 | Sugerencias, consultas, quejas y reclamos a oficina local; respuesta escrita; clasificación por prioridad | Módulo de quejas con respuesta escrita versionada | Leída |
| Reglamento LDDPPSS Art. 9 | Oficina obligatoria en hospitales; formularios; tres prioridades y plazos | Prioridad con reloj: inmediato/24 h, 3-5 días, 15 días; alerta antes del vencimiento | Leída ([vLex](https://sv.vlex.com/vid/reglamento-ley-deberes-derechos-1076726394), fecha de publicación no visible) |
| Reglamento Art. 7 | Información del Art. 13 verbal e inmediata; en casos complejos por escrito en formatos MINSAL en máximo 24 h | Registro de información entregada en el expediente | Leída |
| LDDPPSS Art. 33 f | Derechos y deberes visibles | Contenido imprimible desde el sistema | Leída |
| LDDPPSS Art. 44 d, 45 c | Negarse a resolver quejas: infracción leve, amonestación | Reporte de quejas vencidas a dirección | Leída |
| LDDPPSS Art. 8, 50-61 | Denuncia ante OTD del CSSP; plazos en días hábiles; prescripción 6 meses a 2 años | Caso externo vinculado a la queja interna; preservación de evidencia | Leída |
| [Ley de Protección al Consumidor](https://www.defensoria.gob.sv/wp-content/uploads/download-manager-files/LPC_version_popular.pdf) | Información previa de precios; prohibido cobrar lo no prestado o no autorizado; prohibido pagaré en blanco; reclamo escrito al proveedor antes de denuncia | Cotización y estado de cuenta trazables (R14); prohibir en el sistema el registro de garantías en blanco | Leída (versión popular; aplicabilidad a hospitales por definición general de proveedor) |
| LPDP Art. 16, 18, 20 | ARCO-POL, 20 días hábiles | Solicitud con reloj en días hábiles y calendario de asuetos | Leída |

## 5. Requisitos derivados

1. Recepción de queja por formulario en papel (digitalizado), presencial, teléfono o web, con fecha, canal, servicio y hechos.
2. Clasificación de prioridad por una persona; el reloj corre desde la recepción; reclasificar deja rastro.
3. Si la queja describe riesgo actual para un paciente, crea alerta clínica inmediata además del caso.
4. Investigación con responsable distinto del involucrado, evidencias vinculadas (episodio, cargos, auditoría de acceso) y respuesta escrita aprobada.
5. Cierre separado de conformidad del reclamante; reapertura con historia.
6. Vínculo opcional con incidente de seguridad del paciente (R18) y con reclamo financiero (R14, R16).
7. Caso externo (CSSP, Defensoría, judicial) con número, plazos y preservación legal que suspende disposición.
8. Solicitudes de datos con titular verificado, representación acreditada, plazo de 20 días hábiles, resultado y evidencia de entrega.
9. Indicadores: quejas por servicio y tipo, vencidas, tiempo de respuesta por prioridad, reincidencia.

## 6. Pendientes para CLIMESA

1. ¿Tienen oficina o buzón de quejas? ¿Quién responde y cómo lo registra?
2. ¿Han tenido denuncias ante el CSSP o la Defensoría?
3. ¿Cómo entregan hoy copias del expediente y en cuánto tiempo?
4. ¿Piden pagaré o garantía firmada al ingreso? (riesgo bajo la Ley de Protección al Consumidor si va en blanco)

## Fuentes

- [LDDPPSS, Decreto 307 (2016)](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2010-2019/2016/04/B7B3F.PDF): leída.
- [Reglamento de la LDDPPSS (vLex)](https://sv.vlex.com/vid/reglamento-ley-deberes-derechos-1076726394): leída (Art. 7, 9, 18, 19, 33).
- [Ley de Protección al Consumidor, versión popular](https://www.defensoria.gob.sv/wp-content/uploads/download-manager-files/LPC_version_popular.pdf): leída.
- LPDP y norma de expediente: leídas en R01.
- V8 G812-G815: heredadas.
