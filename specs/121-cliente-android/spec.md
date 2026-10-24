# 121. Cliente Android

**Estado:** En revisión · **Semanas:** S1 a S5 · **Depende de:** 100, 101 · **Investigación:** ADR-0003; requisitos del curso (Kotlin, Gradle, MVVM, corrutinas)

## Objetivo

App Android en Kotlin con Jetpack Compose para operaciones en punto de atención (Recepción, Asistente, Enfermería, Médico, Laboratorio, Paramédico) y para el Paciente, con MVVM, corrutinas y datos en vivo.

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-121-01 | La app debe usar Kotlin, Jetpack Compose, Gradle con catálogo de versiones, y MVVM con `ViewModel` y `StateFlow`. | R | REQ-PLT-02, 04 |
| FR-121-02 | Toda operación de red debe ser asíncrona con corrutinas; ninguna en el hilo principal. | R | REQ-PLT-04 |
| FR-121-03 | Tras iniciar sesión, la app debe mostrar la navegación inferior según el rol (`/me`). | R | avance "navegación principal" |
| FR-121-04 | La app debe suscribirse a Realtime con supabase-kt, invalidar y volver a pedir los datos afectados. | R | REQ-PLT-06 |
| FR-121-05 | La app debe recibir notificaciones push FCM para los eventos de `tiempo-real.md` marcados con push. | E | ADR-0005 |
| FR-121-06 | En la app del paramédico, las órdenes de hitos y el reporte prehospital deben encolarse sin conexión (Room cifrado) y reenviarse con la misma clave. | E | FR-109-10 |
| FR-121-07 | Cada pantalla debe implementar los estados comunes del inventario. | R | inventario de pantallas |
| FR-121-08 | La app no debe guardar datos clínicos en disco salvo la cola del paramédico, que se borra al enviarse. | R | privacidad.md 3.7 |

## Escenarios de aceptación
1. **Navegación por rol.** Dado un Paramédico, cuando entra, entonces ve Unidad, Servicio, Bitácora y Perfil.
2. **Rotación de pantalla.** Dado un formulario a medio llenar, cuando se gira el teléfono, entonces no se pierde lo escrito (estado en ViewModel).

## Pantallas
A01 a A74 según `inventario-pantallas.md`.
