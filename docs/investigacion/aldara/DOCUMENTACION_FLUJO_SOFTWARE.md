# Documentación funcional del Sistema de Gestión Hospitalaria Aldara

Este documento resume el flujo general del sistema, los módulos disponibles, las funciones principales y los permisos asociados a cada rol.

> Ubicación recomendada de lectura: este archivo está en la raíz del proyecto, junto a `AldaraHospital.sln`.

---

## 1. Flujo general del software

El sistema Aldara Hospital centraliza operaciones clínicas, administrativas, financieras y de inventario mediante una aplicación web ASP.NET Core MVC.

El flujo principal del sistema es el siguiente:

1. El usuario inicia sesión con una cuenta asignada a un rol.
2. El sistema muestra módulos según los permisos del rol.
3. Cada módulo permite registrar, consultar o actualizar información específica del hospital.
4. Las operaciones importantes quedan controladas por validaciones, autorización por roles y registros de auditoría.
5. Los errores del sistema quedan registrados en archivos `.log` dentro de la carpeta `logs/`.

---

## 2. Cuentas de acceso por rol

Estas cuentas se crean automáticamente cuando la aplicación se ejecuta en ambiente `Development` y después de aplicar las migraciones.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrator | `admin@aldara.local` | `123Admin2026!` |
| Reception | `reception@aldara.local` | `123Reception2026!` |
| MedicalStaff | `doctor@aldara.local` | `123Doctor2026!` |
| Nursing | `nursing@aldara.local` | `123Nursing2026!` |
| Pharmacy | `pharmacy@aldara.local` | `123Pharmacy2026!` |
| Cashier | `cashier@aldara.local` | `123Cashier2026!` |
| Accounting | `accounting@aldara.local` | `123Accounting2026!` |
| Management | `management@aldara.local` | `123Management2026!` |

---

## 3. Módulos del sistema

### 3.1 Dashboard

**Ruta:** `Home/Index`  
**Acceso:** usuarios autenticados y visitantes pueden ver la pantalla inicial, pero los módulos protegidos requieren iniciar sesión.

Funciones principales:

- Acceso visual a las áreas principales del sistema.
- Entrada rápida a pacientes y citas.
- Vista general de los módulos disponibles.

---

### 3.2 Pacientes

**Controlador:** `PatientsController`  
**Política:** `PatientIntake`  
**Roles con acceso:** `Administrator`, `Reception`

Funciones:

- Buscar pacientes por nombre, documento y estado.
- Registrar nuevos pacientes.
- Registrar contacto de emergencia opcional.
- Consultar detalles del paciente.
- Editar datos administrativos.
- Inactivar o reactivar pacientes.

Notas importantes:

- El sistema no elimina físicamente pacientes.
- La inactivación conserva el historial clínico, financiero y administrativo.
- Se valida que el número de documento no se repita.

---

### 3.3 Citas

**Controlador:** `AppointmentsController`  
**Política:** `PatientIntake`  
**Roles con acceso:** `Administrator`, `Reception`

Funciones:

- Listar y filtrar citas.
- Crear citas para pacientes activos.
- Asignar médico a la cita.
- Editar citas programadas.
- Cancelar citas.
- Marcar citas como atendidas.

Validaciones relevantes:

- No se permite crear citas sin paciente o médico.
- No se permite programar una cita para un paciente inactivo.
- No se permite doble reserva del mismo médico en horarios solapados.
- Las acciones de cancelar o marcar como atendida se hacen mediante POST, no por GET.

---

### 3.4 Admisiones

**Controlador:** `AdmissionsController`  
**Política:** `PatientIntake`  
**Roles con acceso:** `Administrator`, `Reception`

Funciones:

- Consultar admisiones activas o finalizadas.
- Crear admisión para un paciente activo.
- Asignar cama disponible.
- Dar de alta a un paciente.

Reglas principales:

- No se permite admitir un paciente inactivo.
- No se permite admitir dos veces al mismo paciente si ya tiene una admisión activa.
- No se permite asignar una cama ocupada.
- Al crear admisión, la cama pasa a estado ocupado.
- Al dar alta, la cama vuelve a estar disponible.

---

### 3.5 Expediente clínico

**Controlador:** `ClinicalRecordsController`  
**Política:** `ClinicalWork`  
**Roles con acceso:** `Administrator`, `MedicalStaff`

Funciones:

- Buscar expedientes clínicos por paciente.
- Ver línea de tiempo clínica del paciente.
- Registrar consultas médicas.
- Registrar signos vitales.
- Registrar diagnósticos.
- Registrar prescripciones.
- Crear consulta desde una cita existente.

Reglas principales:

- Solo personal médico o administrador puede acceder al expediente clínico.
- Si una consulta se crea desde una cita, el sistema marca la cita como atendida dentro de una misma transacción.
- No se permite crear consulta desde una cita cancelada.
- No se permite crear una segunda consulta para una cita ya atendida.

---

### 3.6 Enfermería

**Rol:** `Nursing`

Estado actual:

- El rol existe dentro del sistema.
- La política `Nursing` está configurada.
- El módulo específico de enfermería todavía no tiene un controlador funcional completo.

Uso previsto:

- Seguimiento básico de pacientes.
- Apoyo en signos vitales.
- Observaciones durante hospitalización.

Importante:

- Actualmente el rol `Nursing` no tiene acceso al módulo de expediente clínico, porque `ClinicalRecordsController` está protegido por la política `ClinicalWork`, que solo permite `Administrator` y `MedicalStaff`.
- Si se desea que Enfermería registre o consulte signos vitales desde el expediente clínico, hay que ampliar la política o crear un módulo específico para enfermería.

---

### 3.7 Inventario

**Controlador:** `InventoryController`  
**Política:** `Pharmacy`  
**Roles con acceso:** `Administrator`, `Pharmacy`

Funciones:

- Listar productos.
- Filtrar productos por categoría y estado de stock.
- Crear productos.
- Editar productos.
- Crear categorías.
- Ver detalles de producto.
- Crear lotes.
- Registrar ajustes de stock.
- Consultar movimientos de inventario.

Reglas principales:

- El stock se maneja por lotes.
- No se permite que el stock quede negativo.
- Los movimientos de inventario quedan registrados.
- Los cambios de stock usan concurrencia optimista mediante `RowVersion`.

Qué significa concurrencia aquí:

- Si dos usuarios intentan modificar el mismo lote al mismo tiempo, el sistema evita que uno sobrescriba silenciosamente el cambio del otro.
- En ese caso se muestra un mensaje para recargar la información y volver a intentar.

---

### 3.8 Farmacia

**Controlador:** `PharmacyController`  
**Política:** `Pharmacy`  
**Roles con acceso:** `Administrator`, `Pharmacy`

Funciones:

- Ver productos disponibles para dispensación.
- Seleccionar lote disponible.
- Registrar salida de stock.
- Registrar referencia de la salida.

Reglas principales:

- No se permite dispensar más cantidad que la disponible.
- Cada salida genera un movimiento de inventario.
- Usa control de concurrencia para evitar errores de stock.

---

### 3.9 Compras y proveedores

**Controlador:** `PurchasesController`  
**Política:** `Pharmacy`  
**Roles con acceso:** `Administrator`, `Pharmacy`

Funciones:

- Consultar compras.
- Crear compras.
- Ver detalle de compra.
- Recibir compra en inventario.
- Registrar proveedores.
- Editar proveedores.
- Inactivar proveedores.

Reglas principales:

- Al recibir una compra, el sistema actualiza el lote y registra movimiento de inventario.
- La recepción de compra se realiza dentro de una transacción.
- Si el lote fue modificado por otro usuario al mismo tiempo, el sistema maneja el conflicto de concurrencia.

---

### 3.10 Facturación

**Controlador:** `BillingController`  
**Política:** `Billing`  
**Roles con acceso:** `Administrator`, `Cashier`

Funciones:

- Consultar facturas.
- Crear factura para paciente activo.
- Ver detalle de factura.
- Registrar pagos.
- Calcular saldo pendiente.
- Cambiar estado de factura según pagos.

Estados de factura:

- `Open`: factura abierta sin pago completo.
- `Partial`: factura con pago parcial.
- `Paid`: factura pagada completamente.

Reglas principales:

- No se permite facturar a un paciente inactivo.
- El total de factura se calcula en el servidor.
- No se permite registrar pagos con monto cero o negativo.
- No se permite pagar más que el saldo pendiente.
- El pago, el movimiento de caja y el estado de factura se guardan dentro de una transacción.

#### Caso importante: Contabilidad y Facturación

El rol `Accounting` no tiene permiso directo al módulo `Billing`.

Por eso, si entrás con:

```txt
accounting@aldara.local
```

y tratás de abrir una ruta de facturación, el sistema puede mostrar acceso denegado.

Esto es correcto según la configuración actual, porque:

| Módulo | Política | Roles permitidos |
|---|---|---|
| Billing / Facturación | `Billing` | `Administrator`, `Cashier` |
| Accounting / Contabilidad | `Accounting` | `Administrator`, `Accounting` |

Si querés que Contabilidad también use Facturación, hay dos caminos posibles:

1. Asignar al usuario de contabilidad también el rol `Cashier`.
2. Modificar la política `Billing` para permitir también el rol `Accounting`.

Actualmente, por separación de responsabilidades, Facturación pertenece a Caja y Contabilidad tiene su propio módulo.

---

### 3.11 Caja y movimientos de efectivo

**Controlador:** `AccountingController`, acción `Cash`  
**Política:** `Accounting`  
**Roles con acceso:** `Administrator`, `Accounting`

Funciones:

- Consultar movimientos de caja.
- Filtrar por fecha.
- Filtrar por tipo de movimiento.
- Ver ingresos y egresos.

Notas:

- Los pagos registrados en Facturación generan movimientos de caja tipo ingreso.
- Los gastos operativos generan movimientos tipo egreso.

---

### 3.12 Contabilidad operativa

**Controlador:** `AccountingController`  
**Política:** `Accounting`  
**Roles con acceso:** `Administrator`, `Accounting`

Funciones:

- Consultar gastos operativos.
- Registrar gastos.
- Generar movimientos de caja por gastos.
- Crear asientos contables básicos.
- Ver detalle de asientos contables.

Reglas principales:

- El registro de gasto crea movimiento de caja.
- El registro de gasto crea asiento contable con línea de débito y crédito.
- Todo se guarda dentro de una transacción.

---

### 3.13 Reportes

**Controlador:** `ReportsController`  
**Política:** `ManagementReports`  
**Roles con acceso:** `Administrator`, `Management`

Funciones:

- Ver indicadores administrativos.
- Filtrar información por rango de fechas.
- Consultar cantidad de pacientes.
- Consultar pacientes activos.
- Ver citas agrupadas por estado.
- Ver productos con stock bajo.
- Ver lotes próximos a vencer.
- Ver ingresos.
- Ver gastos.
- Ver saldo pendiente en facturas.

Notas:

- Las consultas de reportes son de solo lectura.
- Los reportes están pensados para dirección o administración general.

---

### 3.14 Gobierno de datos

**Ruta:** `Home/Privacy`  
**Acceso:** visible desde el menú principal.

Funciones:

- Presentar criterios generales sobre uso de datos.
- Recordar separación entre información clínica, financiera e identidad.
- Reforzar el acceso mínimo necesario por rol.

---

### 3.15 Login y credenciales por rol

**Ruta:** `/Identity/Account/Login`

Funciones:

- Iniciar sesión con correo y contraseña.
- Mostrar cuentas por rol cuando la aplicación corre en ambiente `Development`.
- Permitir probar los permisos de cada rol.

Notas:

- El panel de credenciales no se muestra fuera de `Development`.
- Cada rol tiene un correo y contraseña diferente.

---

## 4. Resumen de permisos por rol

| Rol | Módulos principales permitidos |
|---|---|
| Administrator | Acceso por política a pacientes, citas, admisiones, expediente clínico, inventario, farmacia, compras, facturación, contabilidad y reportes. |
| Reception | Pacientes, citas y admisiones. |
| MedicalStaff | Expediente clínico y consultas médicas. |
| Nursing | Rol configurado; módulo específico pendiente de completar. No entra al expediente clínico con la configuración actual. |
| Pharmacy | Inventario, farmacia, compras y proveedores. |
| Cashier | Facturación y pagos. |
| Accounting | Contabilidad, caja, gastos y asientos contables. No entra a facturación salvo que se le agregue el rol Cashier o se cambie la política Billing. |
| Management | Reportes e indicadores generales. |

---

## 5. Políticas técnicas de autorización

| Política | Roles autorizados | Módulos protegidos |
|---|---|---|
| `Administration` | Administrator | Administración general. |
| `PatientIntake` | Administrator, Reception | Pacientes, citas, admisiones. |
| `ClinicalWork` | Administrator, MedicalStaff | Expediente clínico y consultas. |
| `Nursing` | Administrator, Nursing | Área de enfermería. |
| `Pharmacy` | Administrator, Pharmacy | Inventario, farmacia, compras, proveedores. |
| `Billing` | Administrator, Cashier | Facturación y pagos. |
| `Accounting` | Administrator, Accounting | Caja, gastos, asientos contables. |
| `ManagementReports` | Administrator, Management | Reportes. |

---

## 6. Accesos denegados esperados

Un acceso denegado no siempre significa error. Muchas veces significa que el usuario inició sesión con un rol que no tiene permiso para ese módulo.

Ejemplos:

| Usuario/Rol | Intenta entrar a | Resultado esperado | Motivo |
|---|---|---|---|
| Accounting | Billing | Acceso denegado | Billing solo permite Administrator o Cashier. |
| Cashier | Accounting | Acceso denegado | Accounting solo permite Administrator o Accounting. |
| Nursing | Clinical records | Acceso denegado | ClinicalWork solo permite Administrator o MedicalStaff. |
| Reception | Inventory | Acceso denegado | Inventory requiere Pharmacy. |
| Pharmacy | Patients | Acceso denegado | Patients requiere PatientIntake. |
| Management | Billing | Acceso denegado | Management solo tiene reportes. |

---

## 7. Logs del sistema

El sistema usa Serilog para registrar eventos importantes.

Ubicación de logs:

```txt
logs/
```

Formato esperado:

```txt
logs/aldara-YYYYMMDD.log
```

Se registran eventos como:

- inicio y cierre de la aplicación;
- errores fatales;
- solicitudes HTTP;
- conflictos de concurrencia en inventario;
- validaciones relevantes en pagos;
- pagos registrados correctamente.

No se deben registrar:

- contraseñas;
- tokens;
- cookies;
- notas clínicas completas;
- datos sensibles de pago.

Para más detalle, revisar:

```txt
docs/LOGGING.md
```

---

## 8. Flujo recomendado de prueba

Después de aplicar migraciones y ejecutar la aplicación:

1. Entrar con `admin@aldara.local`.
2. Revisar que los módulos generales carguen correctamente.
3. Entrar con `reception@aldara.local`.
4. Crear paciente.
5. Crear cita.
6. Crear admisión si hay cama disponible.
7. Entrar con `doctor@aldara.local`.
8. Registrar consulta clínica para un paciente.
9. Entrar con `pharmacy@aldara.local`.
10. Crear producto, lote y movimiento de stock.
11. Registrar compra y recibir stock.
12. Entrar con `cashier@aldara.local`.
13. Crear factura y registrar pago.
14. Entrar con `accounting@aldara.local`.
15. Revisar movimientos de caja y registrar gasto.
16. Entrar con `management@aldara.local`.
17. Revisar reportes.

---

## 9. Comandos básicos para ejecutar

Desde la raíz del proyecto:

```bash
dotnet restore AldaraHospital.sln
```

Aplicar migraciones:

```bash
dotnet ef database update --project src/AldaraHospital.Web/AldaraHospital.Web.csproj
```

Ejecutar:

```bash
dotnet run --project src/AldaraHospital.Web/AldaraHospital.Web.csproj
```

Compilar:

```bash
dotnet build AldaraHospital.sln
```

---

## 10. Notas finales

- Los permisos se controlan en servidor, no solo en el menú visual.
- Aunque un enlace aparezca en alguna parte de la interfaz, el controlador puede negar acceso si el rol no cumple la política.
- Para permitir acceso cruzado entre módulos, hay que modificar la política correspondiente o asignar más de un rol al usuario.
- La separación actual busca mantener responsabilidades claras entre recepción, clínica, farmacia, caja, contabilidad y dirección.
