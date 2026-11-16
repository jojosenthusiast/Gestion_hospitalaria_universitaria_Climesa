# Manual del Administrador (ADM)

**Plataforma:** web (https://sghu-web.onrender.com).
**Qué hace:** configura y asegura el sistema: cuentas y roles, edificio, catálogo de laboratorio y artículos de inventario. No opera pacientes ni ve contenido clínico (D-050).

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Menú

| Módulo | Para qué |
|---|---|
| Inicio | Tablero "Administración del sistema" |
| Personal | Personal de salud, cuentas, invitaciones y roles |
| Edificio | Árbol de plantas, áreas, habitaciones y camas |
| Turnos | Consultar la planificación (no planifica) |
| Catálogo de laboratorio | Exámenes y rangos de referencia |
| Inventario | Artículos, lotes y mínimos (sin movimientos) |
| Métricas | Indicadores del hospital |
| Perfil | Tu cuenta |

## Inicio

El tablero tiene accesos rápidos: **Invitar persona**, **Agregar espacio** y **Ver métricas**. Los indicadores de cuentas llevan a **Personal**: "Cuentas activas" abre el directorio y "Cuentas por estado → Abrir cuentas" y "Cuentas por completar → Vincular" lo abren filtrado a las personas con cuenta.

## Personal: cuentas, invitaciones y roles

- **Filtros:** **Mostrar** (activo, inactivo o todo), **Filtrar por función**, **Área** (incluye "Sin área asignada"), **Cuenta de acceso** (con cuenta, cuenta activa, cuenta desactivada, invitación pendiente o sin cuenta todavía), **Rol** y **Turno de hoy** (De turno ahora, Turno más tarde, Ausentes o Libres).
- **Registrar personal:** crea la ficha de una persona del hospital, con sus inscripciones profesionales.
- **Invitar:** crea la cuenta de una persona y le envía el correo de invitación. Los roles son obligatorios.
  - Los pacientes no se invitan: crean su cuenta en la app.
  - Solo el administrador principal puede invitar o cambiar a otro administrador.
- **Reenviar** y **Cancelar invitación:** aparecen mientras la invitación está pendiente. Cancelar pide un motivo.
- **Roles:** cambia los roles de una cuenta. Nadie puede cambiarse sus propios roles.
- **Desactivar** y **Reactivar:** una cuenta desactivada no puede ingresar.
  - Nadie puede desactivarse a sí mismo.
  - Siempre queda al menos un administrador activo.
  - Si la persona tiene trabajo abierto (por ejemplo un turno en curso), la API lo impide y lo explica.

## Edificio

- **Agregar espacio dentro** y **Editar:** crea o cambia plantas, áreas, habitaciones y camas.
- La capacidad la controla la base: una habitación no puede tener más camas que su capacidad.
- La capacidad del curso es fija: P3 tiene VIP-301 a VIP-305 (1 cama cada una) y P2 tiene HAB-201 a HAB-206 (2 camas cada una).

## Catálogo de laboratorio

- Crea y edita exámenes. **Agregar rango** y **Quitar** cambian los rangos de referencia, incluidos los límites "Crítico bajo" y "Crítico alto".
- **Guardar examen** crea una versión nueva con fecha de vigencia. Los resultados anteriores conservan los rangos con que se calcularon.
- La unidad de un examen no se puede cambiar cuando ya tiene resultados.

## Inventario

- Puedes ver existencias y configurar: **Nuevo artículo**, **Editar artículo**, **Nuevo lote** y mínimos.
- No registras movimientos. La pantalla lo indica con "Todas las categorías, solo consulta y configuración". Los movimientos los registran JOP, LAB (reactivos) y ENF (consumo).

## Métricas

- Elige el indicador (ocupación diaria, estancia promedio, tiempos de laboratorio, respuesta de la ambulancia, horas con hueco de cobertura) y el rango: últimos 7, 14 o 30 días.
- **Exportar** o **Exportar todo**.

## Lo que no puedes hacer

- No ves pacientes, hospitalización, laboratorio clínico ni auditoría.
- Si escribes a mano la ruta de un módulo que no está en tu menú, la web regresa a Inicio.
