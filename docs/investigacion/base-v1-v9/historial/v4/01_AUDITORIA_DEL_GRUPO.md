# Hallazgos reconfirmados y ampliados
Raíz de evidencia: src/AldaraHospital.Web. Los hashes de seis archivos se guardan en evidencia_codigo.json. Revisión estática.

| ID | Evidencia observada | Implicación | Tratamiento candidato |
|---|---|---|---|
| B401 | ProductBatch tiene QuantityOnHand global, sin ubicación/propietario/calidad | Saldo numérico no distingue disponible, cuarentena o pertenencia | Libro de existencias por dimensiones y reservas |
| B402 | PurchaseCreateViewModel y CreateAsync generan una línea | Modelo admite Details, pero flujo de creación no compra varias líneas | Orden y recepciones multilínea con vínculos por línea |
| B403 | ReceiveAsync suma todas las cantidades y marca Received | No registra parcial, rechazo ni aceptación distinta de descarga física | Recibido, inspeccionado, liberado y facturado por separado |
| B404 | CreateAsync busca lote con IgnoreQueryFilters; si existe no verifica su ExpirationDate ni IsDeleted | Posible reutilización de lote oculto/inconsistente; fecha del formulario no reemplaza metadatos existentes | Bloqueo/revisión de lote; pruebas con expiración y registros retirados |
| B405 | ChangeStockAsync revisa saldo no negativo y RowVersion | Control útil contra sobrescritura; no valida aquí expiración, retiro o calidad | Preservar concurrencia, añadir elegibilidad y reservas |
| B406 | DispenseAsync resta stock con Reference libre | Sin PrescriptionDetailId, PatientId, atención, dosis o destinatario en el movimiento | Dispensación como evento clínico con movimiento enlazado |
| B407 | ClinicalRecordService crea PrescriptionDetail sin ProductId | Aunque ProductId existe opcional en entidad, este camino no lo vincula | Catálogo medicamento/presentación y vínculo de orden |
| B408 | Dosage/Frequency son cadenas y DurationDays entero | No hay representación completa de PRN, infusión, vía, pausas ni cambios de pauta | Orden estructurada/versionada y generación de tareas validada |
| B409 | No existe controlador enfermería/eMAR en los 11 controladores examinados | Nursing como rol no implementa administración/omisión/turno | Dominio y permisos propios |
| B410 | Initial stock guarda cantidad y movimiento sin costo en ProductBatch | Existencia inicial no demuestra valoración contable | Inventario inicial con cantidad/costo/origen revisados |
| B411 | ReceiveAsync protege stock con transacción/RowVersion; Received repetido devuelve failure | No se observó clave idempotente ni respuesta durable del comando | Idempotencia y reconciliación; probar misma solicitud/doble recepción |
| B412 | Inventario no llama a contabilización/cargo en métodos revisados | Salida física no prueba cargo clínico ni costo reconocido | Eventos económicos tipados con hito y propiedad |
| B413 | RowVersion del formulario se convierte desde Base64 sin manejo específico del formato | Entrada malformada podría lanzar excepción en este camino | Validación de token; reproducir antes de afirmar falla |
| B414 | SupplierService desactiva mediante soft-delete; compras históricas tienen relación requerida | Riesgo de visibilidad según filtros/join; no se reprodujo | Permitir consulta histórica autorizada sin reutilizar proveedor inhabilitado |

No se afirma que las carreras/ocultamientos hayan ocurrido. Crear una compra con lote existente, recibir simultáneamente, repetir solicitud y desactivar proveedor son casos pendientes de ejecución.

## Decisiones candidatas
D401 — Separar requisición, orden, recepción, aceptación, factura y pago.
D402 — Calidad/expiración/propiedad/ubicación no se representan con QuantityOnHand.
D403 — FEFO decide rotación física elegible; valoración decide costo, de forma independiente.
D404 — Prescripción, dispensación y administración deben conservar eventos propios y referencias.
D405 — Una suspensión no repone stock; una devolución requiere custodia y evaluación.
D406 — Una corrección de registro clínico no crea automáticamente una devolución física ni nota fiscal.
D407 — Consignación y medicamento del paciente mantienen propiedad; no se valoran como compra propia por presencia física.
D408 — Preparación tiene genealogía de insumos/producto, rendimiento y residuo.
D409 — Soporte urgente/caída necesita procedimiento y reconciliación; no se logra con permitir cualquier bypass.
D410 — Información clínica y reglas económicas comparten origen, pero hito de cargo/consumo/ingreso requiere política explícita.

