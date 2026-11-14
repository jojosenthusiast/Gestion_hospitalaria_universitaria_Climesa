# Sistema de diseño Android

Fuente visual: la web (`web/src/styles.css`, `web/src/modules.css`, `components/ui.tsx`, `features/common.tsx`). Los archivos viven en `ui/theme/` y `ui/components/`, pero el paquete es `sv.edu.catolica.climesa.ui`: no hay que importar nada.

## Reglas para las pantallas

- Colores: `MaterialTheme.colorScheme.*` y, para los que Material no tiene (éxito, advertencia, estados, línea), `MaterialTheme.climesa.*`. Nada de `Color(0x…)` sueltos.
- Espacios: `Spacing.xs/sm/md/lg/xl` (4/8/16/24/32). Radios: `MaterialTheme.shapes` (6/10/16, igual que la web).
- Texto nuevo: `res/values/strings.xml`, en español.
- Una pantalla que lista datos usa `PageList` y cubre sus cuatro estados: cargando, error, vacío y contenido.

## Componentes

| Componente | Uso |
|---|---|
| `ClimesaTheme(dark)` | Ya envuelve la app en `MainActivity`. Claro y oscuro portados de la web. |
| `PortalScaffold` | Barra superior + navegación adaptable por rol (barra inferior, riel o menú lateral permanente, hoja "Más funciones"). |
| `ClimesaTopBar`, `MenuButton`, `ThemeToggleButton` | Barra superior propia (marca + subtítulo). Para pantallas de detalle, pasa `navigationIcon` con un botón Volver. |
| `PageList` / `PageColumn` | Cuerpo estándar con margen de página y separación entre bloques. |
| `SectionCard(title, eyebrow, action) { … }` | Bloque con título. |
| `StatTile(value, label, suffix, icon)` | Número grande con leyenda. Varios en un `Row` con `Modifier.weight(1f)`. |
| `DataRow(title, subtitle, meta, leadingIcon, status, onClick)` | Fila de registro (paciente, cama, turno). Con `onClick` muestra flecha. |
| `LabeledValue(label, value)` | Dato de una ficha. |
| `StatusTag(code, label?)` | Etiqueta de estado con los códigos y colores de la web (`StatusCatalog`). `StatusPill(text, tone)` para texto libre. |
| `FormField(label, value, onChange, error, hint)` | Campo con error anunciado por TalkBack. El tope de longitud lo pone quien llama. |
| `PrimaryButton`, `SecondaryButton`, `DangerButton` | `loading = true` muestra "Un momento…" y bloquea toques. Peligrosas: siempre con `ConfirmDialog`. |
| `EmptyState`, `LoadingState`, `ErrorState(message, onRetry, forbidden)` | Estados de la pantalla. `ErrorState` trae "Reintentar"; `forbidden = true` es el 403 de la web. |
| `RefreshHint` | Barra mientras se refresca sin quitar el contenido. |
| `NoticeBanner(kind, text)` | Aviso en línea (éxito, error, info, advertencia). |
| `ConflictBanner(onReload)` | Conflicto de versión 409: "Cerrar y recargar". |
| `ConfirmDialog(title, confirmLabel, onConfirm, onDismiss, destructive, busy, body)` | Confirmación; con `busy` no se puede cerrar. |
| `LiveIndicator` | "En vivo" mientras la suscripción en tiempo real está activa. |
| `ProfileSummaryCard`, `AppearanceCard`, `profileItems` | Referencia de perfil, reutilizable por cualquier rol. |

Los componentes previos (`ClimesaCard`, `ClimesaButton`, `SectionIntro`) siguen disponibles y ya usan este estilo.

## Patrón de pantalla

```kotlin
PageList(modifier) {
    item { SectionIntro("Rol / CLIMESA", "Título") }
    when {
        state.loading -> item { LoadingState() }
        state.error != null -> item { ErrorState(state.error, onRetry = model::load) }
        state.rows.isEmpty() -> item { EmptyState("No hay registros") }
        else -> items(state.rows, key = { it.id }) { DataRow(it.name, meta = it.record, status = { StatusTag(it.state) }) }
    }
}
```

Referencias: `RolePortal`, `ReceptionApp`, `ProfileScreen`, `HospitalInfoScreen`.
