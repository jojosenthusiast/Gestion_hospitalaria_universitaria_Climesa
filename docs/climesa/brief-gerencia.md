# Sistema hospitalario para CLIMESA: propuesta de base

**Versión:** 1 (2026-10-13). Documento corto para la primera conversación con gerencia.

## Qué es

Un sistema hospitalario propio para CLIMESA, instalado en el hospital (no depende de internet para operar), que une admisión, expediente, camas, emergencia, cargos, facturación electrónica y contabilidad en un solo flujo. Se construye sobre una base de investigación de 21 dominios con las normas salvadoreñas vigentes leídas en su texto, no supuestas.

## Por qué ahora

| Hecho | Fecha | Qué implica para CLIMESA |
|---|---|---|
| Normativa DTE 2.0 de Hacienda | Publicada 25-may-2026; migración hasta 1-dic-2026 | Si emiten DTE con un sistema que no migre, dejan de poder facturar válido |
| Norma de expediente clínico reformada (Acuerdo 698) | Marzo 2026 | Acceso, copia y rectificación con registro automático de quién y cuándo |
| Lineamientos de CEYE (Acuerdo 1584) | Julio 2026 | Bitácora por carga, implantes retenidos hasta indicador biológico negativo |
| Ley de Protección de Datos Personales, reformada por Decreto 659 | Reforma de septiembre 2026 | Siguen vigentes los derechos de los pacientes sobre sus datos (respuesta en 20 días hábiles) y el aviso de brecha en 72 h |
| Ley de Ciberseguridad | 2024 | Salud es servicio esencial; exige gestión de riesgos y continuidad |
| LDDPPSS Art. 29 | Vigente | La estancia se cobra hasta la firma del alta, no hasta la salida física |
| Código Tributario (reforma 2024) | Vigente | No se puede exigir nombre ni DUI en factura de consumidor final bajo US$25,000 (multa 30%) |

## Qué se hace distinto

1. **Especificación antes de código.** Cada módulo tiene requisitos verificables y criterios de aceptación escritos antes de programar; CLIMESA los revisa.
2. **Migración medida, no prometida.** Piloto con un lote de expedientes, medición de errores y tiempos, y solo después la migración completa. Nada se destruye en papel sin acta.
3. **Los datos son de CLIMESA.** Base de datos estándar (PostgreSQL), exportación completa, código y documentación entregados.
4. **Auditoría desde el día uno.** Cada acceso y cambio queda registrado y no se puede borrar sin dejar rastro.
5. **Nada económico bloquea una emergencia.** Regla de diseño, no de capacitación.
6. **Funciona si cae internet.** Opera en la red del hospital; la nube solo guarda respaldos cifrados.

## Fases propuestas

| Fase | Contenido | Resultado que CLIMESA puede verificar |
|---|---|---|
| 0. Diagnóstico | Cuestionario por área, documentos actuales, inventario TI | Alcance confirmado y lista de decisiones firmada |
| 1. Núcleo | Identidad de pacientes, expediente y archivo, admisión, emergencia, camas, alta, digitalización de papel | Pacientes sin duplicados, censo real de camas, expedientes buscables |
| 2. Facturación | Cuenta del paciente, cargos, DTE, caja, aseguradoras | Factura electrónica válida desde el episodio, sin cargos perdidos |
| 3. Clínico | Órdenes, medicación, enfermería, laboratorio, quirófano | Registro clínico completo y trazable |
| 4. Administración | Compras, inventario, contabilidad, personal | Inventario y contabilidad conciliados con la operación |

El orden se ajusta con el diagnóstico: si el DTE es urgente, la fase 2 se adelanta.

## Qué se necesita de CLIMESA

- Una persona responsable por área para validar requisitos (admisión, dirección médica, enfermería, contabilidad, TI).
- Acceso al cuestionario de levantamiento y copia de formatos actuales.
- Un lote de expedientes de papel para el piloto de migración, bajo confidencialidad.

## Riesgos que hay que decir desde el inicio

- **On-premise significa que la operación de seguridad es del hospital.** Hace falta alguien que atienda alertas y pruebe respaldos, propio o contratado.
- **La migración del papel cuesta tiempo de personal de archivo.** Se mide en el piloto, no se supone.
- **Un sistema no mejora nada si los procesos siguen siendo los mismos.** Cada fase se mide antes y después.
