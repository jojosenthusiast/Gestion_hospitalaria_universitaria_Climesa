# Plan de adopción y transición de este grupo
## Trabajo que puede avanzar con evidencia pública/código
Diseño del modelo semántico, contratos, invariantes, casos de error, comparación de interfaces, trazabilidad y propuesta de permisos.
No requiere esperar contratos privados para definir que pago y aplicación son distintos o que identidades necesitan procedencia.

## Evidencia local necesaria por decisión
| Decisión | Responsable candidato | Evidencia requerida | Bloquea |
|---|---|---|---|
| Identificación/representación | Admisión, archivo, dirección y privacidad | SOP, documentos admitidos, casos de desconocido/menor/representante | Política productiva de identidad y exportación |
| Definición atención/alta | Dirección médica/enfermería/admisión | Flujo real por servicio, entregas y resultados postalta | Transiciones y dueños de continuidad |
| Tarifa/pagadores | Facturación/seguros/contador | Tarifario versionado, paquetes, contratos y glosas | Motor económico productivo |
| Devengo y honorarios | Contador/dirección | Políticas, plan de cuentas, contratos profesionales | Reglas de contabilización y liquidación |
| DTE/tributos | Contador/asesoría y responsable fiscal | Situación emisor, anexos vigentes, tipos de operación | Emisión fiscal |
| Integraciones | TI y proveedores | ERP/LIS/PACS actuales, versiones/APIs/exportación/licencias | Elección adaptador y pruebas reales |
| Continuidad | Dirección/TI/servicios | Incidentes, infraestructura, impacto y tiempos tolerables | RPO/RTO y arquitectura operativa |

Este listado es insumo para levantamiento; no solicita datos personales ni credenciales. No hay bloqueo total de investigación por ausencia de documentos locales.

## Conversión del modelo actual
1. Inventario y mapeo sin modificar el esquema.
2. Patient.Id se preserva como referencia legacy; documento pasa a identificador con emisor solo cuando se verifica.
3. No generar nacimiento exacto a partir de edad estimada; representar incertidumbre.
4. IsActive legado se conserva con significado desconocido hasta clasificación. No traducir false a fallecido ni merge.
5. Admission/Consultation/Appointment se mapean a conceptos distintos; relación temporal sugerida no se toma como identidad de atención confirmada.
6. Invoice/Payment/CashMovement se conservan. El pago actual ligado a factura migra a pago+aplicación con reconciliación; no emitir DTE retrospectivo sin obligación definida.
7. AccountingEntry histórico se importa como evidencia contable según revisión; no asumir toda caja ya contabilizada.
8. Conservar origen/versiones/hashes y control de conteos, importes, vínculos. Conflictos en cola.
9. Preparar migración reversible con reconciliación de saldos y todos los consumidores. No ejecutar en esta fase.

## Elección continuar/refactor/reconstruir
La ampliación del dominio no obliga a rehacer autenticación, páginas o stack útiles.
Continuación modular: viable si introducir atenciones/identificadores/cuentas preserva evidencias y límites claros.
Refactor profundo: si las relaciones existentes impiden trazabilidad, cambiar dominios con adaptadores legacy y pruebas.
Reconstrucción parcial: candidata para áreas sin implementación equivalente, e.g. MPI supervisado/eMAR/reclamaciones, después de comparar productos.
Reescritura integral: solo si costo/riesgo de adaptación, dependencias, soporte y migración probados superan alternativas. No hay esa evidencia aún.
Ninguna opción recibe puntaje de desempeño o costo ficticio.

## Próximo grupo I03/I04
Compras: solicitud, aprobaciones, orden/recepción/factura parciales, cuarentena, propiedad y valoración, CxP/pago.
Medicamento: prescripción estructurada, validación, preparación, dispensación por lote, administración, devolución, retiro y cargo/costo.
Dependencias: ID estable, atención, orden, profesional habilitado, ubicación, versión de catálogo y origen económico.
Referencias a recuperar: reglas locales de medicamento/controlados, procesos de farmacia/enfermería, documentation OpenMRS/Bahmni/GNU Health y sistemas de stock/ERP, literatura de circuito cerrado.
Entrega siguiente: contratos y datos por paso, matriz de eventos, reglas/invariantes, seguridad, escenarios, tasks y migración; sin repetir solo un mapa de módulos.

