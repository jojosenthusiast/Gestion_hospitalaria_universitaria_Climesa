> Nota de fusión: este documento describe el acceso por rol de la v11 (domain/AccessRouting.kt, ahora usado como guarda adicional). En 0.3.0 el flujo vigente usa RoleAccess y RolePortal con Hilt; ver EMPEZAR_ANDROID.md.

# Entrega 02 · Android: acceso por rol

## Implementado

- La sesión autenticada ya no abre una pantalla común para todas las cuentas.
- `PAC` entra al portal del paciente.
- `REC` entra al módulo de recepción existente.
- `AST`, `ENF`, `MED`, `LAB` y `PAR` quedan reconocidos y muestran un acceso provisional hasta implementar su módulo específico.
- `ADM`, `JOP` y `DPD` no reciben módulos Android porque sus plataformas definidas son web.
- Una sesión sin respuesta válida del API Node.js queda bloqueada en una pantalla de verificación; no se conceden permisos por defecto.
- Se añadieron pruebas unitarias para estas decisiones de navegación.

## Decisión de seguridad

La clave publicable de Supabase permite autenticar la aplicación, pero no debe utilizarse para decidir permisos administrativos. Android espera la respuesta de `/auth/me` del API Node.js para conocer roles y permisos. Las claves secretas del backend nunca se incluyen en la aplicación.

## Siguiente bloque

El próximo módulo Android será el de `PAC`: vinculación segura de la cuenta con su expediente, citas, fila de atención y resultados de laboratorio revisados. Cada pantalla se conectará a endpoints con autorización y RLS antes de mostrar datos clínicos.
