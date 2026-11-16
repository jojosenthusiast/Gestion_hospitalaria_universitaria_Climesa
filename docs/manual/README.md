# Manual de usuario de CLIMESA

Una página por rol, con las pantallas reales de cada plataforma que usa ese rol. Describe el código de `main` en el commit `c7f31a6` (16-nov-2026). Todos los datos del sistema son ficticios.

| Rol | Código | Plataformas | Página |
|---|---|---|---|
| Administrador | ADM | Web | [administrador.md](administrador.md) |
| Jefe de Operaciones | JOP | Web | [jefe-operaciones.md](jefe-operaciones.md) |
| Recepcionista | REC | Web y Android | [recepcionista.md](recepcionista.md) |
| Asistente | AST | Android | [asistente.md](asistente.md) |
| Enfermero/a | ENF | Android | [enfermeria.md](enfermeria.md) |
| Médico | MED | Android e iOS | [medico.md](medico.md) |
| Laboratorista | LAB | Web | [laboratorista.md](laboratorista.md) |
| Paramédico | PAR | Android | [paramedico.md](paramedico.md) |
| Delegado de protección de datos | DPD | Web | [delegado-proteccion-datos.md](delegado-proteccion-datos.md) |
| Paciente | PAC | Android e iOS | [paciente.md](paciente.md) |

Fuente de los roles y sus plataformas: `docs/arquitectura/datos/roles.csv`. Fuente de los permisos: `docs/arquitectura/datos/permisos.csv`. La operación técnica (despliegue, migraciones, cuentas, correo, respaldos) está en el [manual del operador](../operacion/runbook-operador.md).

## Lo que vale para todos los roles

### Dónde se ingresa

- **Web:** https://sghu-web.onrender.com. El personal ingresa con correo y contraseña.
- **Android e iOS:** la app CLIMESA. El paciente crea su cuenta en la app; el personal recibe una invitación por correo.
- La pantalla de ingreso saluda con "Bienvenido" en la web, en Android y en iOS.
- Si un rol no usa la plataforma donde ingresó, la pantalla dice "Tu rol no usa esta aplicación" e indica dónde ingresar, con el botón "Cerrar sesión".

### Cuenta y contraseña

- **Invitación (personal):** el correo lleva a `/aceptar-invitacion`, donde se crea la contraseña. La página muestra en qué plataformas ingresa cada rol.
- **Olvidé mi contraseña:** en la web, "¿Olvidaste tu contraseña?" en el ingreso; en Android e iOS, "¿Olvidaste tu contraseña?" → "Enviar enlace". El enlace del correo abre `/restablecer` en la web.
- **Cambiar la contraseña:** en la web, menú **Mi cuenta** (arriba a la derecha) → **Ver mi cuenta**.
- **Cerrar sesión:** en la web, **Mi cuenta → Cerrar sesión**; en las apps, **Perfil**. La web cierra la sesión del personal tras 15 minutos de inactividad.

### Cómo se comporta la aplicación

- **El menú depende del permiso.** Cada cuenta ve solo los módulos que su rol puede usar.
- **Los botones dependen del servidor.** En citas, fila, admisiones, órdenes de laboratorio, servicios de ambulancia e invitaciones, cada fila muestra solo las acciones que la API permite en ese momento. Si un botón no aparece, la acción no está permitida todavía o ya no lo está.
- **Todo se actualiza en vivo.** Lo que hace otra persona aparece sin recargar. No hace falta actualizar la página.
- **Arranque en frío.** Si el servidor estaba dormido, aparece "El servidor se está activando"; la primera conexión del día puede tardar hasta un minuto.
- **Motivos.** Las acciones que corrigen o anulan algo (cancelar, retirar, corregir, cerrar) piden un motivo. Muchas exigen al menos 10 caracteres. Nada clínico se borra: se corrige con autor, fecha y motivo.
- **Filtros que se comparten (web).** Los filtros de **Pacientes** y **Personal** quedan en la dirección de la página (por ejemplo `#/pacientes?situacion=hospitalizado`): se conservan al recargar, al volver atrás y al compartir el enlace. El texto que escribes en la búsqueda nunca va en la dirección. Si un enlace trae un filtro que tu rol no puede usar o un valor no válido, la web lo quita antes de pedir la lista. Los filtros activos aparecen como etiquetas que se quitan una por una o todas a la vez, y una lista vacía dice qué filtro la dejó así.
- **Exportar.** Las listas con el botón **Exportar** generan CSV, Excel (.xlsx) o PDF. Cada exportación queda en la auditoría.

### En Android

- En un teléfono, la barra inferior muestra **Inicio** y hasta tres tareas principales; el resto está en **Más** (grupos "Más tareas", "Hospital" y "Mi cuenta"). En una tableta aparece un riel o un menú lateral.
- Si una cuenta tiene varios roles, el selector "*Rol* ▾" cambia de rol.
- Si la sesión vence y no se puede renovar, la app vuelve al ingreso con "Tu sesión expiró".

## Avisos (web)

Todas las cuentas de la web tienen **Avisos** en el menú.

- **Para mí** lista los avisos vigentes para tu rol o tu área, con los críticos primero. Filtros: **Todos**, **Sin leer** y **Críticos**. Al abrir uno ves el detalle; pulsa **Enterado** cuando lo leíste.
- Un aviso **Crítico** dirigido a tu rol o a tu área aparece arriba en **Inicio** y se queda hasta que pulsas **Enterado**. **Recordarme en 4 h** lo aparta y vuelve solo a las 4 horas si sigues sin dar **Enterado**.
- Los avisos **Informativos** e **Importantes** no salen en Inicio; quedan en **Avisos**.

## Limitaciones de esta entrega

- No hay notificaciones push: los avisos llegan solo con la app abierta.
- La app iOS no se ha probado en un iPhone.
- Una consulta firmada no se puede corregir (addendum pendiente).
- Figma no está sincronizado con estas pantallas; la referencia visual vigente es `docs/diseno/claude-design/`.
