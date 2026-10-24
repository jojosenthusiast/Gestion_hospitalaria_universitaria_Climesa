# Revisar el frontend del corte 0.3.0

Ejecuta `npm ci --prefix web` y `npm run dev --prefix web`. Abre http://localhost:5173/work-preview.html para los módulos actuales. Elige ADM, JOP, REC, LAB o DPD y alterna escritorio/móvil. `?width=320` o `?width=768` permite revisar otros anchos; el móvil usa un viewport de 844 px de alto con scroll interior.

La galería importa `HospitalShell` y las páginas del producto; únicamente sustituye el transporte por datos ficticios en memoria. Permite probar altas y cambios sin credenciales, sin correo y sin escribir en Supabase. No se presenta como una sesión conectada al servidor.

| Rol | Navegación actual |
|---|---|
| ADM | Inicio, Personal, Edificio, Turnos, Usuarios, Mi cuenta |
| JOP | Inicio, Personal, Camas, Edificio, Turnos, Inventario, Mi cuenta |
| REC | Inicio, Pacientes, Camas, Edificio, Turnos, Fila del día, Citas, Mi cuenta |
| LAB | Inicio, Laboratorio, Inventario, Mi cuenta |
| DPD | Inicio, Usuarios, Auditoría, Accesos excepcionales, Mi cuenta |

Inventario, fila/citas, operaciones de laboratorio y accesos excepcionales están identificados como pendientes de las semanas siguientes. Pacientes, personal, turnos, espacios, camas y usuarios tienen sus formularios/consultas del core. La aplicación conectada utiliza `/auth/me`, permisos efectivos y la API; la galería no sustituye esas comprobaciones.

En http://localhost:5173/design-preview.html se revisan los componentes actuales de ingreso, registro PAC, confirmación, activación y errores. Ya no se usa la antigua vista única de invitaciones como si fuera todo el portal.

La composición usa azul cobalto, tinta oscura, blanco cálido y acento lima, con DM Sans e IBM Plex Mono locales. La navegación es horizontal, los módulos tienen tablas amplias, los formularios son planos y las filas se reorganizan al reducir el ancho. No hay sombras ni degradados.

Para producción: `npm run build --prefix web` genera solo el portal. Para exportar la galería de revisión: `npm run build:design --prefix web`. Los fixtures quedan fuera del build normal.

## Figma

La sincronización queda expresamente para la siguiente etapa. El archivo anterior https://www.figma.com/design/bHJjbgi64I0p0Bnw8nho8e no se modificó en este corte y no representa todavía todas las vistas nuevas. Las capturas y el JSON de la revisión anterior se conservan en `docs/revision/anterior-0.2/`, identificados como históricos.

## Android e iOS

Android mantiene Compose nativo y ya usa la API para recepción, camas y turnos propios. iOS tiene proyecto SwiftUI con MED/PAC y sesión en Keychain. Se compilaron las reglas de Kotlin; los builds completos de Android e iOS están pendientes del SDK y Xcode. Consulta `EMPEZAR_ANDROID.md` e `ios/README.md`.
