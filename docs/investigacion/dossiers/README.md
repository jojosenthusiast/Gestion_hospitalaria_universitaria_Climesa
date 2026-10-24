# Dossiers de investigación por módulo

Cada dossier consolida, para un dominio: lo que V1-V9 y P01 ya establecieron, lo que se conserva, ajusta o descarta (con razón), la investigación nueva verificada, y los cambios que eso provoca en las specs. Las fuentes llevan estado de lectura: **leída** (texto abierto en esta sesión), **parcial** (secciones abiertas), **heredada** (declarada en V1-V9, no reabierta), **pendiente**.

Regla: un dato que no se pudo abrir no se usa como requisito; queda como pendiente con su fuente.

| ID | Dominio | Fuentes V1-V9 principales | Specs que alimenta | Estado |
|---|---|---|---|---|
| [R01](./R01-identidad-expediente-archivo.md) | Identidad, expediente y archivo | V3-02, V3-01, V8-05, V8-06, P01 §3-5 | 001, 003, 005 | Completo v1 |
| [R02](./R02-migracion-papel-legado.md) | Migración desde papel y sistemas previos | V1-05, V2-07, V3-06, P01 T310 | 004 | Completo v1 |
| [R03](./R03-episodio-camas-alta.md) | Episodio, admisión, camas, traslados, alta | V3-03, V7-02, V7-06 | 002 | Completo v1 |
| [R04](./R04-emergencia-transferencias.md) | Emergencia y transferencias | V6-02 | 002, clínicas | Completo v1 |
| [R05](./R05-medicacion-farmacia-enfermeria.md) | Órdenes, medicación, farmacia, enfermería | V4-04, V7-03 | clínicas | Completo v1 |
| [R06](./R06-compras-inventario-cxp.md) | Compras, inventario, CxP | V4-02, V4-03 | ERP | Completo v1 |
| [R07](./R07-laboratorio-resultados-criticos.md) | Laboratorio y resultados críticos | V5-02, V5-04 | integración LIS | Completo v1 |
| R08 | Imagen RIS/PACS | V5-03 | integración PACS | Diferido: v0 = contenido V1-V9 sin reabrir |
| [R09](./R09-cirugia-anestesia-ceye.md) | Cirugía, anestesia, CEYE | V6-03, V6-04, V6-05 | clínicas | Completo v1 |
| R10 | Transfusión | V6-06 | clínicas | Diferido: v0 = contenido V1-V9 sin reabrir |
| R11 | UCI y dispositivos | V7-04 | clínicas | Diferido: v0 = contenido V1-V9 sin reabrir |
| R12 | Nutrición | V7-05 | clínicas | Diferido: v0 = contenido V1-V9 sin reabrir |
| R13 | Servicios de apoyo (limpieza, textiles, residuos, biomédica) | V7-07 | operación | Diferido: v0 = contenido V1-V9 sin reabrir |
| [R14](./R14-cuenta-cargos-costos.md) | Cuenta, cargos, costos | V3-04, V4-05 | 006 | Completo v1 |
| [R15](./R15-dte-fiscal.md) | DTE y fiscal | V3-08, V2-02 | 007 | Completo v1 |
| [R16](./R16-contabilidad-tesoreria-seguros.md) | Contabilidad, tesorería, seguros, reclamos | V2-03, V7-09, P01 T309 | 008, 009 | Completo v1 |
| [R17](./R17-rrhh-turnos-credenciales.md) | RRHH, turnos, credenciales, planilla | V8-02, V8-06 | RRHH | Completo v1 |
| R18 | Calidad, seguridad del paciente, IAAS | V8-04 | calidad | Diferido: v0 = contenido V1-V9 sin reabrir |
| R19 | Salud ocupacional y continuidad | V8-03 | operación | Diferido: v0 = contenido V1-V9 sin reabrir |
| [R20](./R20-seguridad-ti-interfaces-operacion.md) | Seguridad TI, interfaces y operación | V5-05, V2-05, V1-05 | 000, 005 | Completo v1 |
| [R21](./R21-quejas-derechos.md) | Quejas y derechos de los pacientes | V8-05 | 005 | Completo v1 |
| [R22](./R22-contabilidad-general-multicliente.md) | Flujo de la contadora general (CLIMESA y cartera propia) | V2-03, R14-R16 | 007, 008, 009, producto contable | Completo v1 |

## Cierre de la fase de investigación (2026-10-13)

Los dossiers del núcleo están completos. Los marcados **Diferido** dependen de si CLIMESA presta ese servicio (imagen propia, banco de sangre, UCI, nutrición, servicios de apoyo, calidad, salud ocupacional). Hasta confirmarlo, rige el contenido de V1-V9 sin reabrir, y ningún dato de esos paquetes se convierte en requisito sin pasar por un dossier. Se reabren cuando el cuestionario a CLIMESA (`docs/climesa/`) confirme el servicio.
