# Registro regulatorio y consecuencias de diseño
Estado al 12 de octubre de 2026. Este es un registro de trabajo, no un dictamen legal consolidado.
La aplicabilidad depende de razón social, autorización, tipo de establecimiento, servicios, contratos y cambios normativos.

## Hallazgo verificable: reforma del expediente clínico
[V2-02] Se recuperó el texto oficial del Acuerdo Ejecutivo 698, fechado 9 de febrero de 2026 y publicado el 19 de marzo de 2026. Reforma la norma emitida en 2024.
- Reforma del art. 41: solicitud de acceso/copia/exportación y verificación de representación; conservación del original.
- Reforma del art. 42: procedimiento de rectificación; registro electrónico de momento, usuario y detalle de lo modificado; discrepancia entre papel y electrónico.
Diseño propuesto: solicitud con expediente, solicitante, acreditación, estado y decisión; exportación controlada; correcciones versionadas con autor, instante y razón; expediente físico asociado y resolución documentada de discrepancias.
No asignar un plazo ni una retención inventados a estos flujos.

## Cambio posterior que exige consolidación
[V2-03] El registro de Asamblea identifica Decreto 659, emitido 17/09/2026, que reforma la Ley para la Protección de Datos Personales. Se recuperó su ficha indexada, pero falló la lectura completa. No se confirmó publicación, entrada en vigor, articulado consolidado ni régimen transitorio en esta sesión.
Debe contrastarse con la norma clínica de marzo que menciona al delegado; no fijar el organigrama de privacidad de una empresa privada basándose solo en ese texto anterior.

## Matriz de investigación legal
| Área | Texto/evidencia a recuperar | Operación afectada | Datos/configuración y validación |
|---|---|---|---|
| Establecimiento y profesionales | CSSP, Código de Salud, ley CSSP/Juntas y RTA aplicable; licencia CLIMESA | Servicios habilitados y profesionales autorizados | Privilegio, vigencia, regente, sede, evidencia de autorización |
| Pacientes y prestadores | Ley de Deberes y Derechos y reformas | Información, consentimiento, representación, reclamaciones | Formulario/versionado, firmante y fundamento de excepción |
| Expediente | Norma 2024 completa + Acuerdo 698 + reformas posteriores | Creación, firma, custodia, rectificación, copia y conservación | Matriz por tipo documental; no borrar una nota firmada como CRUD |
| Datos personales | Ley 2024, Decreto 659, publicaciones y criterios de ACE | Bases de tratamiento, avisos, derechos, encargados, incidentes | Propósito, acceso, solicitudes, transferencias, constancias |
| Firma electrónica | Ley/reglamento y régimen aplicable por documento | Firma clínica, aprobación y firma fiscal | Distinguir autenticación, firma interna y firma con efectos legales |
| Fiscal | Código Tributario, IVA, renta, normas DTE y anexos MH | Facturas, notas, retenciones, compras, anulaciones | Tributo por línea/prestación/entidad; validar antes de codificar |
| Contable | Marco adoptado por entidad y requisitos profesionales | Devengo, inventarios, provisiones, activos y estados | Políticas y plan aprobados; no suponer NIIF completas o PYMES |
| Trabajo y seguridad social | Código de Trabajo, ISSS/AFP y normativa vigente | Nómina, turnos, incapacidades, contratos | Parámetros por vigencia; separar nómina y honorarios independientes |
| Medicamentos | Autoridad competente y normativa de medicamentos/controlados | Compra, custodia, dispensación y farmacovigilancia | Lotes, prescriptor, movimientos, autorización y reportes |
| Laboratorio/sangre/radiología | Reglas sanitarias y radioprotección específicas | Calidad, habilitación, trazabilidad y notificaciones | Equipos, calibraciones, autorizaciones y registros por servicio |
| Residuos/ambiente/ocupacional | MINSAL, MARN y MTPS según materia | Segregación, transporte, manifiestos, accidentes | Proveedor autorizado, pesaje, evidencia y seguimiento |
| Aseguradoras y terceros | Contratos privados y anexos | Cobertura, precios, glosas, plazos y liquidación | Versiones contractuales, evidencia de autorización y aceptación |

## Fuentes descartadas como obligación vigente
El resultado Norma_estadistica_hospitales.pdf y el manual_de_procedimientos_atencion_hospitalaria.pdf están alojados en /derogados/ de MINSAL. Pueden servir para historia de procesos, no para afirmar cumplimiento actual.
ISSS tiene normas propias: no asumir aplicabilidad directa a CLIMESA.
Normas mexicanas/estadounidenses/europeas sirven para comparación técnica; HIPAA, GDPR, NOM y facturación estadounidense no se importan automáticamente a El Salvador.
Los RTA CSSP encontrados [V2-04, V2-05] son fichas públicas; aún falta el instrumento completo y su revisión vigente aplicable al hospital.

## DTE: evidencia disponible y trabajo pendiente
[V2-06] El portal MH ofrece documentación funcional/técnica, esquemas JSON, catálogos y pruebas mínimas. Se leyó el índice, no todos los anexos. La versión del portal cambia; congelar los anexos evaluados con fecha y hash antes de desarrollar.
Contrato propuesto: preparar, validar, firmar, transmitir, recibir resolución, entregar y archivar; distinguir aceptación/rechazo/respuesta desconocida. La factura interna no se vuelve fiscal por tener número.
Ante timeout, consultar/reconciliar antes de duplicar. Contingencia e invalidación deben seguir el manual vigente; sus plazos no se inventan aquí.
No asumir que todos los servicios privados están exentos o gravados igual. El contador debe aprobar clasificación por servicio, producto, profesional y entidad facturante.

## Cómo cerrar un requisito legal
Registrar instrumento, artículo, versión/publicación, ámbito, interpretación local, responsable, regla operativa, evidencia y prueba. Una referencia sin artículo recuperado queda pendiente. Solicitar confirmación profesional sobre conflictos de normas y configuración tributaria; el backlog técnico puede avanzar sin fabricar esas reglas.

