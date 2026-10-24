# 101. Identidad, cuentas y acceso

**Estado:** En revisión · **Semanas:** S1, S2, S3 · **Depende de:** 100 · **Investigación:** R17 (credenciales), R20; ADR-0004; `docs/arquitectura/roles-y-permisos.md`

## Objetivo

Login y registro con roles en las tres plataformas (criterio del avance), con el personal creado por invitación y el paciente creando su propia cuenta que solo ve datos privados después de ser verificado.

## Alcance
- Dentro: inicio de sesión con Supabase Auth, perfil y permisos (`/me`), invitación del personal, roles y su asignación, desactivación, registro del paciente, vinculación con expediente y su verificación, catálogo de roles y permisos como datos, canales de Realtime permitidos en el token.
- Fuera: doble factor (F), inicio de sesión con proveedores externos (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-101-01 | El sistema debe permitir iniciar sesión con correo y contraseña en web, Android e iOS mediante Supabase Auth. | R | REQ-PLT-01 a 03; avance |
| FR-101-02 | Cuando una persona crea una cuenta desde la app móvil, el sistema debe darle el rol Paciente sin acceso a datos personales ni clínicos. | R | D-032; avance "Register" |
| FR-101-03 | Cuando un usuario autenticado consulta `/me`, el sistema debe devolver su nombre, roles, permisos efectivos, plataformas permitidas y canales de tiempo real. | R | ADR-0004 |
| FR-101-04 | Si un usuario inicia sesión en una plataforma que su rol no usa, entonces el cliente debe mostrar "Tu rol no usa esta aplicación" y cerrar la sesión. | R | D-052 |
| FR-101-05 | Cuando el Administrador invita a una persona del personal, el sistema debe crear su cuenta, enlazarla con su registro de personal y enviarle el enlace para definir contraseña. | R | D-050, D-053 |
| FR-101-06 | El sistema debe impedir que un usuario se asigne roles a sí mismo o se quite el último Administrador. | R | RN-38 |
| FR-101-07 | Cuando se desactiva una cuenta, el sistema debe invalidar sus sesiones activas en el siguiente uso del token y conservar su historial. | R | D-003 |
| FR-101-08 | Cuando un paciente envía DUI y fecha de nacimiento para vincular su cuenta, el sistema debe buscar candidatos y crear una vinculación pendiente. | R | D-032, RN-39 |
| FR-101-09 | Cuando Recepción aprueba una vinculación, el sistema debe enlazar la cuenta con el expediente y avisar al paciente en tiempo real. | R | D-032 |
| FR-101-10 | Si Recepción rechaza una vinculación, entonces el sistema debe exigir motivo y mostrarlo al paciente. | R | D-032 |
| FR-101-11 | Si la persona no tiene expediente, entonces Recepción debe crearlo con "buscar antes de crear" (spec 102) antes de aprobar. | R | D-011 |
| FR-101-12 | El sistema debe guardar roles y permisos como datos versionados, sembrados desde `docs/arquitectura/datos/`. | R | ADR-0004 |
| FR-101-13 | Cuando un rol cambia, el sistema debe aplicar el cambio sin esperar a que venza el token. | R | ADR-0004 |
| FR-101-14 | El sistema debe incluir en el token los canales de Realtime permitidos mediante un gancho de Supabase Auth, recalculados al renovar el token. | R | ADR-0005 |
| FR-101-15 | Cuando falla el inicio de sesión, el sistema debe mostrar un mensaje que no revele si el correo existe. | R | R20 |
| FR-101-16 | Donde el usuario es personal clínico, el sistema debe mostrar la vigencia de su inscripción en el perfil. | E | R17 |

## Escenarios de aceptación

1. **Registro de paciente.** Dada una persona sin cuenta, cuando se registra en iOS, entonces entra con rol Paciente y ve solo información pública y el formulario de vinculación.
2. **Vinculación aprobada.** Dado un paciente con expediente, cuando envía su DUI y Recepción aprueba, entonces su app muestra sus citas y exámenes sin recargar.
3. **Rol equivocado.** Dado un Paramédico, cuando inicia sesión en la web, entonces ve "Tu rol no usa esta aplicación".
4. **Autoasignación.** Dado un Administrador, cuando intenta agregarse el rol Médico, entonces recibe 403.
5. **Desactivación.** Dado un médico con sesión abierta, cuando lo desactivan, entonces su siguiente llamada recibe 401.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-38, RN-39.
- Datos: `USUARIO`, `ASIGNACION_ROL`, `VINCULACION_PACIENTE`.
- Endpoints: spec 101 en la matriz RBAC.
- Pantallas: W01, W02, W05, W06, W27, W35; A01 a A03, A12, A33; I01 a I03, I12.

## Preguntas abiertas
Ninguna bloqueante.
