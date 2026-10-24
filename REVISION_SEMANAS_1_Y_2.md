# CLIMESA · revisión y construcción de S1/S2

Fecha: 24-oct-2026. Corte 0.3.0. Fuentes: documento del curso `docs/curso/PROYECTO_FINAL_DAMA.pdf`, páginas 3–5; tareas `specs/*/tasks.md`; migraciones y código del proyecto.

## Resultado del corte

Se implementó el core funcional pendiente y se amplió el rediseño a los módulos web. La entrega ya no se limita a invitaciones y datos locales. Quedan pendientes las comprobaciones remotas, los builds móviles completos y la siguiente sincronización de Figma; por esos criterios no se declaran ambas semanas cerradas al 100%.

| Alcance | Implementación y evidencia | Estado verificable |
|---|---|---|
| API modular | NestJS/Fastify, `pg`, transacciones, Clock, PolicyRegistry, idempotencia, auditoría encadenada y outbox | Build y pruebas locales correctos |
| JWT y permisos | Verificación con Auth, cuenta activa, perfil multirrol y plataformas desde base; 10 roles/75 permisos | Pruebas HTTP para roles, tokens falsos/vencidos, 403 auditado y cuenta desactivada |
| Usuarios | Directorio, invitación, vinculación con personal, cambios de roles/estado, autoasignación y último ADM | API/SQL probados; proveedor de correo simulado solo en tests |
| Pacientes | Fonética, DUI, expediente MOD 11-2, constancia de búsqueda por actor y 10 min, registro, ficha, historial, edición, inactivación e identidad provisional | Integración y reglas verificadas localmente; sin borrado de fichas |
| Privacidad | Campos distintos para REC/LAB/PAC, relación asistencial, iniciales fuera del área y nombre para tratante/área autorizada | Pruebas de API y SQL |
| Personal | Directorio con/sin cuenta, creación, edición, inactivación y versión | Pruebas HTTP y alta mediante UI ficticia |
| Turnos | Planificación, movimiento, cancelación, solapamiento y descanso por política vigente; turnos propios publicados | Pruebas de duración, guardia, descanso, versión y cambios |
| Edificio y camas | Árbol, rutas y recuentos recursivos; capacidad, versión, bloqueo de traslado de camas no libres; tablero por planta | Semilla de 17 camas: 12 semiprivadas y 5 VIP; pruebas y revisión web |
| Web | Menús de cinco roles, módulos, resumen, formularios, estados y tipos generados desde OpenAPI | Build de producto y de revisión; comprobaciones de navegador |
| Realtime web | Broadcast por canal, invalidación, nueva consulta y recuperación autorizada de outbox tras desconexión | Código implementado y transacción/eventos probados; falta prueba con dos sesiones de Supabase |
| Android | Hilt/MVVM, login/registro, siete roles, pacientes remotos, camas y turnos, Keystore | 16 pruebas de reglas compiladas y correctas; APK nueva/dispositivo pendientes |
| iOS | Proyecto Xcode SwiftUI/MVVM, login/registro, MED/PAC, turnos propios, Keychain y paquete de reglas | Sintaxis, proyecto, esquema y plists revisados; build/simulador pendientes |
| Documentación | Arquitectura Node.js, ER anotado por alcance, RBAC, privacidad, README de tres plataformas, migración y Docker/CI | Verificadores documentales locales correctos |
| Figma | Se conserva el archivo anterior y su evidencia histórica | Nuevas vistas diferidas por instrucción del usuario; sin escrituras en esta revisión |

## Pruebas realizadas

- API: 36 pruebas en siete suites Jest. Pipeline HTTP real de Nest/Fastify y PostgreSQL WASM con las 14 migraciones y semilla. Incluye las 28 comprobaciones SQL originales, arquitectura de imports y guardas, permisos, comandos, idempotencia, privacidad, historial, turnos y capacidad.
- La firma del token y el envío de invitaciones se simulan únicamente en los tests de integración. El código de producto llama a Supabase Auth. Estas pruebas no equivalen a un login o correo remoto real.
- Backend TypeScript y web de producción compilaron. OpenAPI y tipos web se regeneraron. Todos los endpoints declaran `x-permiso`; las escrituras indican `Idempotency-Key`.
- Web de revisión compiló por separado. En navegador se comprobaron los cinco menús, pacientes, personal, espacios, usuarios, turnos, camas y auditoría. Se probó registro de paciente sin DUI/nacimiento y alta de personal con datos mínimos, usando fixtures explícitos en memoria.
- Anchos de 320, 390 y 768 px comprobados sin desbordamiento del cuerpo; la navegación desplaza sus opciones dentro de su propia franja. Diálogo móvil a 320×844: ancho 285 px, altura máxima 820 px y scroll interior.
- Kotlin: compilación real del dominio con 2.1.20/JDK 17 y 16 pruebas JUnit correctas. No es compilación de Compose/Hilt/APK.
- iOS: ocho archivos Swift analizados sintácticamente, proyecto con target y esquema compartido válido, plists y XML comprobados. No es compilación de Xcode.

Los resultados y límites están resumidos también en `docs/revision/validacion-0.3.0.json`. Las tareas comprobables se actualizaron en las specs y se regeneró el estado; las tareas dependientes de nube, compilación nativa, CI remoto o Figma siguen abiertas. Los catálogos de 108 endpoints y 96 pantallas describen el alcance total planificado; no significan 108 rutas y 96 pantallas implementadas en S1/S2.

## Lo necesario para cerrar los criterios externos

1. Conectar el proyecto Supabase CLIMESA `gvmvmrusscsfbndnbvbr`. Las conexiones disponibles en esta revisión muestran otros proyectos. No hay `DATABASE_URL` ni credenciales privadas de CLIMESA en el entorno; no se aplicó ninguna migración remotamente.
2. Aplicar la migración nueva después del dry-run, verificar el hook, SMTP y URLs de redirección. Desplegar la API detrás de HTTPS y la web con sus variables públicas. Probar login y registro por rol contra ese entorno.
3. Ejecutar los workflows entregados en el repositorio real y las carreras multisesión en PostgreSQL nativo. Aquí no hay Docker; PGlite tiene una sola conexión y no demuestra carreras concurrentes.
4. Compilar Android con SDK 35 y ejecutar MED/PAC en el simulador iOS de una Mac. Probar cada rol móvil, sesión, retorno desde segundo plano y operaciones conectadas. No se entrega APK/IPA actualizada.
5. Después, sincronizar las vistas actuales a Figma en la etapa solicitada. El archivo anterior no se presenta como actualizado.

Procedimientos concretos: `README.md`, `deployment/README.md`, `EMPEZAR_ANDROID.md`, `ios/README.md` y `.github/workflows/`. No se crearon cuentas ni se enviaron invitaciones reales durante esta revisión.

## Alcance posterior

Las operaciones completas de fila y citas, consulta clínica, laboratorio, admisión/alta/traslado, ambulancia e inventario pertenecen a S3–S5. Sus tablas y bases de navegación no se cuentan como esos módulos terminados. La APK 0.1 se archivó en `instalar/anteriores/`; las capturas y verificación previas de Figma están en `docs/revision/anterior-0.2/`.
