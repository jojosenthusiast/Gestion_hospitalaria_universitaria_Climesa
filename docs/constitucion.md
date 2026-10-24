# Constitución del proyecto

**Versión:** 2.0 (17-oct-2026). Reemplaza la constitución v0.1 del legado (`docs/legado/climesa-his-v0/constitution.md`). Cambiarla exige una decisión registrada en `docs/decisiones/`.

Estos principios son restricciones permanentes. Una spec, plan o tarea que los contradiga está mal hasta que la constitución se enmiende.

## 1. Producto y alcance

1. Un solo producto, el Sistema de Gestión Hospitalaria Universitaria (CLIMESA), con dos perfiles: **curso** (Proyecto Final DAMA, entrega el 21-nov-2026) y **producción CLIMESA** (después del curso). El perfil cambia despliegue y configuración, no el modelo ni las reglas (D-020).
2. Todo se especifica a nivel de producción. Se construye por niveles: **R** lo que exige el curso, **E** extras de alto valor, **F** especificado para CLIMESA y no construido en el curso. Cada requisito declara su nivel.
3. Capacidades del hospital (plantas, habitaciones, camas, consultorios, horarios, rangos de laboratorio, reglas de turnos) son datos configurables, nunca constantes en código.

## 2. Plataforma

1. Monolito modular: una API en ASP.NET Core sobre .NET 10 con módulos que tienen su propio esquema y solo se hablan por contratos (D-021, D-023).
2. PostgreSQL en Supabase. Supabase Auth autentica; Supabase Realtime distribuye eventos; la API es la única que escribe datos de negocio (D-022, D-061).
3. Clientes: web en React con TypeScript; Android en Kotlin con Jetpack Compose y MVVM; iOS en SwiftUI con MVVM, iOS 18 o superior. Asincronía con corrutinas y Flow en Kotlin y async/await en Swift (D-024 a D-026).
4. Tiempo: instantes en UTC (`timestamptz`); fechas locales en `America/El_Salvador`.
5. Repositorio único en GitHub con backend, web, Android, iOS, Supabase, specs y documentación.

## 3. Integridad del dominio

1. Paciente, cuenta de usuario, episodio, cita, número de fila, consulta, orden, resultado, ocupación de cama y servicio de ambulancia son entidades distintas, unidas por identificadores estables (D-002).
2. Nada clínico se borra. Las correcciones crean versión nueva con autor, motivo e instante. "Ingresado por error" es un estado (D-003).
3. No se inventan datos para cumplir una restricción (D-004).
4. Las reglas de ley o política son configuración con versión, vigencia, fuente y aprobador (D-005).
5. La automatización sugiere y avisa; las decisiones clínicas y de identidad las toma una persona autorizada (D-006).

## 4. Confiabilidad y concurrencia

1. Toda orden que cambia estado lleva clave de idempotencia (D-007).
2. Las invariantes de capacidad y exclusividad (cama, ambulancia, turno, número de fila) se garantizan en la base de datos con restricciones o bloqueos dentro de la transacción. La validación en el cliente es comodidad, no garantía (D-063).
3. Los eventos se registran en el outbox en la misma transacción que el cambio; se publican después de confirmar (D-008, D-060).
4. Ningún cliente recarga manualmente ni consulta cada cierto tiempo para enterarse de cambios (D-027).

## 5. Seguridad, privacidad y auditoría

1. Autorización por permiso y contexto (relación de atención, área, turno), no por nombre de rol en el código (D-010).
2. Información pública, interna, personal y clínica se clasifican campo por campo en `docs/arquitectura/privacidad.md`. La API devuelve solo los campos que el permiso permite (minimización).
3. Toda lectura, búsqueda, exportación y cambio de datos de paciente deja auditoría con actor, acción, paciente, resultado y motivo, en un registro de solo inserción encadenado por hash (D-009).
4. La administración técnica no implica acceso clínico; el acceso excepcional es temporal, motivado, aprobado y auditado (D-031).
5. Registros de sistema sin contenido clínico, credenciales ni tokens. Datos de prueba siempre ficticios (D-014).

## 6. Método

1. SDD: cada módulo tiene `spec.md` (requisitos EARS numerados con nivel R, E o F y su origen), `plan.md` y `tasks.md` (tareas atómicas ordenadas, con semana y "Hecho cuando" observable). Nada se construye sin spec aprobada.
2. Cada requisito cita su origen: `REQ-` del curso, `D-` de decisiones, dossier `Rxx`, criterio `ACxxx` o artículo de ley.
3. El avance se mide desde `tasks.md` con `tools/progreso.py`, que genera `specs/ESTADO.md`. No se reporta avance que no esté en una tarea marcada con su verificación.
4. Pruebas contra PostgreSQL real; las reglas de concurrencia tienen prueba automática con ejecuciones simultáneas.
5. Se reporta solo lo que se ejecutó, con el comando y el resultado observado.
6. Documentación, interfaz, specs, base de datos y API (rutas y JSON) en español; identificadores internos del código en inglés; términos legales salvadoreños con su nombre (DUI, expediente, DTE) (D-067).
