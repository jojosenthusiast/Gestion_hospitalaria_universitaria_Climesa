# 122. Cliente iOS

**Estado:** En revisión · **Semanas:** S1 a S5 · **Depende de:** 100, 101 · **Investigación:** ADR-0003; requisitos del curso (Xcode, Swift/SwiftUI, MVVM, async/await)

## Objetivo

App iOS en SwiftUI (iOS 18) para Médico y Paciente, con MVVM, async/await y datos en vivo; misma lógica de producto que Android para esos roles.

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-122-01 | La app debe usar SwiftUI, iOS 18 como mínimo, y MVVM con view models `@MainActor @Observable`. | R | REQ-PLT-01, 04; D-026 |
| FR-122-02 | Toda operación de red debe usar async/await; las vistas no llaman a la red. | R | REQ-PLT-04 |
| FR-122-03 | Tras iniciar sesión, la app debe mostrar las pestañas según el rol (Médico o Paciente). | R | avance "navegación principal en Xcode" |
| FR-122-04 | La app debe suscribirse a Realtime con supabase-swift, invalidar y volver a pedir. | R | REQ-PLT-06 |
| FR-122-05 | La app debe recibir notificaciones APNs para los eventos marcados con push. | E | ADR-0005; D-026 |
| FR-122-06 | Cada pantalla debe implementar los estados comunes del inventario y Dynamic Type. | R | inventario de pantallas |
| FR-122-07 | La app no debe guardar datos clínicos en disco; la sesión se guarda en Keychain. | R | privacidad.md 3.7 |

## Escenarios de aceptación
1. **Pestañas por rol.** Dado un Médico, cuando entra, entonces ve Mi día, Pacientes, Resultados, Turnos y Perfil; un Paciente ve Inicio, Fila, Citas, Exámenes, Más.
2. **Rol sin iOS.** Dado un Recepcionista, cuando entra en iOS, entonces ve "Tu rol no usa esta aplicación".

## Pantallas
I01 a I26 según `inventario-pantallas.md`.
