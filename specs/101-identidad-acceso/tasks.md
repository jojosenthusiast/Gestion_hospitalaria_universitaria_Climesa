# 101. Tareas

- [x] T01 · S1 · R · Migración 0002 de acceso y semilla de roles y permisos desde los CSV
  - Cubre: FR-101-12
  - Depende de: 100-T03
  - Hecho cuando: la base tiene 10 roles y 75 permisos iguales a `docs/arquitectura/datos/`
  - Verificado: Aplicada en Supabase; prueba 17: 10 roles y 75 permisos, 171 asignaciones rol-permiso (histórico: comprobación manual del 17-oct-2026 en la nube; evidencia repetible en el job `postgres-native` de `.github/workflows/supabase.yml`, que corre `supabase/pruebas/01_invariantes.sql` y `02_concurrencia.sh` contra PostgreSQL nativo)
- [x] T02 · S1 · R · Disparador de alta de usuario y rol Paciente por defecto
  - Cubre: FR-101-02
  - Depende de: T01
  - Hecho cuando: registrar en Supabase Auth crea `acceso.usuario` con PAC
  - Verificado: Prueba local 16: alta desde auth.users crea usuario con PAC; invitado sin rol automático
- [x] T03 · S2 · R · Endpoint `/auth/me` con permisos efectivos y plataformas
  - Cubre: FR-101-03, FR-101-04
  - Depende de: T01, 100-T05
  - Hecho cuando: prueba devuelve permisos correctos para un usuario con dos roles
  - Verificado: 28-oct-2026 `api/tests/identidad-acceso.spec.ts` (A1): un usuario REC+LAB recibe roles `['LAB','REC']`, plataformas y permisos exactamente iguales a la unión de ambos roles en `acceso.rol_permiso`, con los permisos propios de REC y de LAB y ninguno de ADM; `tests/core.integration.spec.ts` cubre el perfil multirrol y cada rol. 63 de 63 pruebas pasan en `api/`. La ruta real es `GET /api/v1/auth/me` (el spec decía `/me` y se alineó).
- [ ] T04 · S2 · R · Gancho de token con canales de Realtime
  - Cubre: FR-101-14
  - Depende de: T01
  - Hecho cuando: el token de un REC trae `rol:REC` y `ambulancia`; el de PAC trae `usuario:<id>` y `publico`
  - Avance 28-oct-2026: `acceso.canales_de` está aplicada en Supabase y las pruebas `identidad-acceso.spec.ts` (A2) verifican REC con `rol:REC` y `ambulancia`, PAC con `usuario:<id>`, `publico` y `rol:PAC` sin `ambulancia`, y canales vacíos para una cuenta inactiva. **Sigue abierta** hasta activar `acceso.hook_token` en Authentication → Hooks y decodificar un token real de la nube.
- [x] T05 · S2 · R · Invitación de personal, asignación de roles y desactivación
  - Cubre: FR-101-05, FR-101-06, FR-101-07, FR-101-13
  - Depende de: T03
  - Hecho cuando: pruebas de autoasignación (403), último administrador (409) y cuenta desactivada (401)
  - Verificado: 28-oct-2026 `tests/core.integration.spec.ts` (autoasignación 403, último administrador 409, solo el administrador principal invita a otro ADM) y `tests/identidad-acceso.spec.ts` (A3): desactivar por `PATCH /usuarios/:id/estado` deja `/auth/me` en 401, un cambio de roles se refleja en la siguiente consulta, invitar a MED con `staffId` válido responde 201 y el reintento con la misma clave devuelve lo mismo con el proveedor llamado una vez, y la autoasignación de ADM da 403 con fila `denegado` en `plataforma.auditoria`. Se comprobó por mutación que las pruebas de 403 y de desactivación fallan si se rompe la regla. 63 de 63 pruebas pasan. Alcance: el proveedor de correo está simulado; la invitación real por SMTP queda para la prueba manual en la nube.
- [ ] T06 · S2 · R · Pantallas de ingreso y registro en web, Android e iOS
  - Cubre: FR-101-01, FR-101-02, FR-101-15
  - Depende de: T03, 120-T01, 121-T01, 122-T01
  - Hecho cuando: se ingresa con un usuario de cada rol en su plataforma y el paciente se registra en Android e iOS
  - Avance 28-oct-2026 (solo web): `web/src/__tests__/acceso.test.tsx` (10 pruebas) verifica que MED y PAC ven "Tu rol no usa esta aplicación", que ADM entra al portal, el error de credenciales incorrectas, el error de red, y el registro (contraseña débil y contraseñas distintas no llaman a `signUp`; una válida lo llama una vez). Se comprobó por mutación que invertir la regla de plataforma rompe 3 pruebas. Existen 10 cuentas de demostración (una por rol, en la nube) para la prueba manual en `https://sghu-web.onrender.com`. **Sigue abierta**: faltan Android e iOS y el ingreso comprobado a mano con cada rol.
- [ ] T07 · S3 · R · Vinculación de cuenta y verificación por recepción
  - Cubre: FR-101-08, FR-101-09, FR-101-10, FR-101-11
  - Depende de: T05, 102-T03
  - Hecho cuando: escenario 2 pasa de punta a punta con el aviso en vivo
- [ ] T08 · S5 · E · Vigencia de inscripción en el perfil
  - Cubre: FR-101-16
  - Depende de: 103-T05
  - Hecho cuando: el perfil del médico muestra la fecha de vencimiento


## Verificación del corte 0.3.0 · 24-oct-2026

api/tests/core.integration.spec.ts: perfil multirrol, permisos vigentes, invitación con proveedor simulado, autoasignación, último ADM y cuenta desactivada. Correo/Auth remoto pendiente. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
