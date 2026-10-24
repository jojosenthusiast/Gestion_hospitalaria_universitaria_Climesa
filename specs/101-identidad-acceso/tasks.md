# 101. Tareas

- [x] T01 · S1 · R · Migración 0002 de acceso y semilla de roles y permisos desde los CSV
  - Cubre: FR-101-12
  - Depende de: 100-T03
  - Hecho cuando: la base tiene 10 roles y 75 permisos iguales a `docs/arquitectura/datos/`
  - Verificado: Aplicada en Supabase; prueba 17: 10 roles y 75 permisos, 171 asignaciones rol-permiso
- [x] T02 · S1 · R · Disparador de alta de usuario y rol Paciente por defecto
  - Cubre: FR-101-02
  - Depende de: T01
  - Hecho cuando: registrar en Supabase Auth crea `acceso.usuario` con PAC
  - Verificado: Prueba local 16: alta desde auth.users crea usuario con PAC; invitado sin rol automático
- [ ] T03 · S2 · R · Endpoint `/me` con permisos efectivos y plataformas
  - Cubre: FR-101-03, FR-101-04
  - Depende de: T01, 100-T05
  - Hecho cuando: prueba devuelve permisos correctos para un usuario con dos roles
- [ ] T04 · S2 · R · Gancho de token con canales de Realtime
  - Cubre: FR-101-14
  - Depende de: T01
  - Hecho cuando: el token de un REC trae `rol:REC` y `ambulancia`; el de PAC trae `usuario:<id>` y `publico`
- [ ] T05 · S2 · R · Invitación de personal, asignación de roles y desactivación
  - Cubre: FR-101-05, FR-101-06, FR-101-07, FR-101-13
  - Depende de: T03
  - Hecho cuando: pruebas de autoasignación (403), último administrador (409) y cuenta desactivada (401)
- [ ] T06 · S2 · R · Pantallas de ingreso y registro en web, Android e iOS
  - Cubre: FR-101-01, FR-101-02, FR-101-15
  - Depende de: T03, 120-T01, 121-T01, 122-T01
  - Hecho cuando: se ingresa con un usuario de cada rol en su plataforma y el paciente se registra en Android e iOS
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
