# Registro de requisitos: Proyecto Final DAMA

Fuente: `PROYECTO_FINAL_DAMA.pdf` (Desarrollo de Aplicaciones Móviles Avanzadas, Ing. Herberth Contreras, 5 páginas, recibido 2026-10-17).
Origen de cada requisito: **CUR** = documento del curso; **USR** = indicado por el equipo en conversación; **BASE** = derivado de la base investigativa CLIMESA (V1-V9, P01, R01-R22).

Estado: `Por confirmar` hasta cerrar las preguntas abiertas (sección final).

## Plataformas y stack

| ID | Requisito | Origen |
|---|---|---|
| REQ-PLT-01 | App iOS nativa (Xcode, Swift/SwiftUI) para doctores y pacientes. | CUR |
| REQ-PLT-02 | App Android nativa (Android Studio, Kotlin, Gradle) para recepcionistas, asistentes/enfermeros y doctores. | CUR |
| REQ-PLT-03 | Web administrativa para administradores y jefes de operaciones. Se elige React. | CUR, USR |
| REQ-PLT-04 | MVVM en iOS y Android; asincronía con corrutinas (Kotlin) y async/await o Combine (Swift). | CUR |
| REQ-PLT-05 | Backend sobre Supabase (PostgreSQL). Monolito permitido; microservicios eran sugerencia. | USR |
| REQ-PLT-06 | Los cambios se empujan a los clientes (tiempo real), sin recarga manual ni sondeo periódico. | USR |
| REQ-PLT-07 | Repositorio unificado en GitHub con los tres clientes y el backend. | CUR |

## Roles

| ID | Requisito | Origen |
|---|---|---|
| REQ-ROL-01 | Administrador: usuarios, asignación de espacios, control de recursos, métricas. | CUR |
| REQ-ROL-02 | Doctor: consulta general, órdenes de laboratorio, expedientes e historial. | CUR |
| REQ-ROL-03 | Recepcionista/Asistente: citas, control de turnos, registro e ingreso de pacientes. | CUR |
| REQ-ROL-04 | Paciente: turnos, estado de laboratorio, historial, solicitudes de atención. | CUR |
| REQ-ROL-05 | Jefe de Operaciones: usuario del panel web (alcance por definir). | CUR |
| REQ-ROL-06 | Administración de ingresos (admisiones) en su forma robusta, no la genérica. | USR, BASE (spec 002, 006) |

## Infraestructura y habitaciones

| ID | Requisito | Origen |
|---|---|---|
| REQ-HAB-01 | 3.ª planta: 5 habitaciones VIP individuales, VIP-301 a VIP-305. | CUR |
| REQ-HAB-02 | 2.ª planta: 6 habitaciones semiprivadas de 2 camas, HAB-201 a HAB-206, 12 camas. | CUR |
| REQ-HAB-03 | Sin sobrecupo ni doble asignación de camas, también bajo concurrencia. | CUR |
| REQ-HAB-04 | Algoritmo de asignación lógica de habitaciones para plantas 2 y 3. | CUR |
| REQ-HAB-05 | Administración de recursos e inventarios. | CUR |
| REQ-HAB-06 | 1.ª planta: consulta general. | USR |
| REQ-HAB-07 | Edificio modelado como árbol (edificio, planta, habitación, cama) y recorrido recursivo; capacidades como datos, no como código. | USR, BASE |

## Turnos del personal

| ID | Requisito | Origen |
|---|---|---|
| REQ-TUR-01 | Registro y visualización de horarios de doctores, enfermeras, alergistas, emergencia, asistentes, recepcionistas y otros. | CUR |
| REQ-TUR-02 | Médicos de turno visibles como información pública. | CUR |

## Consulta general y laboratorio

| ID | Requisito | Origen |
|---|---|---|
| REQ-CON-01 | Registro de diagnósticos, recetas y solicitudes de exámenes. | CUR |
| REQ-CON-02 | Información de citas de pacientes. | CUR |
| REQ-LAB-01 | Resultados de laboratorio con estados Pendiente, En Proceso, Completado. | CUR |

## Privacidad

| ID | Requisito | Origen |
|---|---|---|
| REQ-PRV-01 | Público: ocupación general, médicos de turno, avisos generales. | CUR |
| REQ-PRV-02 | Privado: expediente, resultados de laboratorio, habitación asignada a un paciente, datos personales. Solo médico tratante, paciente y administración autorizada. | CUR |
| REQ-PRV-03 | Documentar campos públicos y privados del expediente. | CUR |
| REQ-PRV-04 | Matriz RBAC: endpoints y vistas que cada rol puede ver y modificar. | CUR |
| REQ-PRV-05 | Accesos a datos privados auditados; datos de prueba ficticios. | BASE (Norma 1616 Art. 50, 55-56; spec 005) |

## Ambulancia

| ID | Requisito | Origen |
|---|---|---|
| REQ-AMB-01 | Una sola ambulancia privada. | CUR |
| REQ-AMB-02 | Solicitud y despacho en tiempo real con estados Disponible, En Servicio, En Mantenimiento. | CUR |
| REQ-AMB-03 | Bitácora de emergencias atendidas, filtrable. | CUR |
| REQ-AMB-04 | La ambulancia envía información del paciente antes de llegar. | USR, BASE (R04) |
| REQ-AMB-05 | No se puede despachar dos veces el recurso único (control de concurrencia). | CUR (semana 4-5), BASE |

## Cronograma y evaluación

| Semana | Fecha | Entregable |
|---|---|---|
| 1 | 17 oct | Backend y base de datos, arquitectura de API, Figma, modelo de datos |
| 2 | 24 oct | Login por roles, maquetación base en Xcode, Kotlin y web, estructura de habitaciones y turnos |
| 3 | 31 oct | **Avance (50%)**: Figma 100%, diagrama ER, endpoints base operativos, login y registro con roles, navegación en iOS y Android, CRUD de pacientes y personal, dashboard web |
| 4 | 7 nov | Asignación de habitaciones, recurso único de ambulancia, permisos de privacidad |
| 5 | 14 nov | Integración de las tres plataformas, pruebas de concurrencia, pulido |
| 6 | 21 nov | **Final (50%)**: funcionalidad en 3 plataformas 40%, código y arquitectura 20%, defensa en vivo 20%, documentación y repositorio 20% |

Entregables documentales: enlace a Figma (prototipo y sistema de diseño), documento de arquitectura en PDF (diagrama de arquitectura, diagrama de base de datos, matriz RBAC, política de privacidad), README con instalación, variables de entorno y ejecución de las tres plataformas.
