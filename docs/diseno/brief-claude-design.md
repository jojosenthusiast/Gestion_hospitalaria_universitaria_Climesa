# Brief de diseño para Claude Design

> Referencia inicial. La dirección visual implementada el 24 de octubre de 2026 está en [identidad_actual.md](identidad_actual.md): DM Sans, IBM Plex Mono, azul intenso, tinta oscura y superficies planas. Este brief conserva el planteamiento previo y el alcance futuro de las tres plataformas.

Insumo para crear el sistema de diseño y los prototipos de web, Android e iOS. El inventario completo de pantallas y flujos está en `inventario-pantallas.md` (o su página publicada). Requisito del curso para el 31 de octubre: prototipo interactivo completo para móvil (iOS y Android) y web, y un sistema de diseño básico con paleta accesible, tipografía y estados de componentes.

## 1. Personalidad

Un hospital universitario que se toma en serio la seguridad del paciente. **Sereno, legible y preciso**: nada decorativo compite con un dato clínico. El color se reserva para estados (cama, ambulancia, laboratorio, alertas); la marca vive en un verde azulado clínico usado con moderación. La interfaz se lee a un metro de distancia en un mostrador y con prisa en un pasillo.

Tres reglas que no se negocian:
1. **Ningún estado se comunica solo con color**: siempre texto y, cuando ayuda, un ícono o una forma (por ejemplo, rayado para "bloqueada").
2. **Los datos clínicos van en la tipografía de datos** (cifras alineadas, unidades visibles, rango al lado).
3. **El dato privado nunca se muestra "por si acaso"**: el diseño contempla iniciales, valores ocultos y el estado "sin permiso" como parte normal.

## 2. Paleta (tokens)

Contraste medido con la fórmula WCAG 2.1: todos los textos y estados superan 4.5:1 sobre su fondo, en claro y en oscuro.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg` | `#F4F7F8` | `#0D161A` | Fondo de la app |
| `surface` | `#FFFFFF` | `#142026` | Tarjetas, hojas, tablas |
| `ink` | `#122028` | `#E3ECEF` | Texto principal (16.6:1 / 13.9:1) |
| `muted` | `#4E616B` | `#9AADB5` | Texto secundario (6.5:1 / 7.1:1) |
| `border` | `#D3DDE1` | `#28393F` | Bordes y divisores (decorativo, no portador de información) |
| `primary` | `#0A6C70` | `#5CC3C7` | Marca, acciones principales, enlaces (6.2:1 / 8.0:1) |
| `primary-strong` | `#07575A` | `#86D6D9` | Hover y presionado |
| `primary-soft` | `#E3F2F1` | `#123236` | Fondos seleccionados |
| `on-primary` | `#FFFFFF` | `#0D161A` | Texto sobre botón primario |
| `success` / `-soft` | `#1D7444` / `#E4F3EA` | `#6CCB92` / `#13301F` | Libre, disponible, completado |
| `warning` / `-soft` | `#8F5300` / `#FBEFD9` | `#E8B25E` / `#33260E` | En limpieza, por confirmar, bajo mínimo |
| `danger` / `-soft` | `#B3261E` / `#FBE7E5` | `#F2918A` / `#3A1A17` | Crítico, en servicio de emergencia, errores |
| `info` / `-soft` | `#1F55A3` / `#E6EEFA` | `#8CB2F0` / `#16253D` | Ocupada, en proceso, llamado |
| `violet` / `-soft` | `#6A45A6` / `#EFE9F8` | `#BCA3EE` / `#2A2040` | Reservada, acceso excepcional |
| `slate` / `-soft` | `#4A5865` / `#E9EDF0` | `#AAB7C1` / `#222D33` | Bloqueada, mantenimiento, cancelado, pendiente |

### Estados de dominio

| Dominio | Estado | Color | Ícono o forma |
|---|---|---|---|
| Cama | Libre | success | cama vacía |
| | Ocupada | info | cama con persona, iniciales |
| | Reservada | violet | reloj |
| | En limpieza | warning | escoba o destellos |
| | Bloqueada | slate + rayado diagonal | candado |
| Ambulancia | Disponible | success | ambulancia |
| | En servicio | danger | ambulancia con sirena y cronómetro |
| | En mantenimiento | slate | llave |
| Laboratorio | Pendiente | slate | reloj de arena |
| | En proceso | info | tubo de ensayo |
| | Completado | success | check |
| | Cancelado | slate tachado | x |
| | Revisado por médico | primary | check doble o escudo |
| Resultado | Normal, alto, bajo | ink, warning, warning | flecha arriba o abajo |
| | Crítico | danger, fondo `danger-soft` | triángulo de alerta |
| Fila | En espera, llamado, en atención, atendido, no se presentó | slate, info, primary, success, warning | |
| Prioridad prehospital | Roja, naranja, amarilla, verde | danger, warning, `#8A7300` sobre claro, success | número de prioridad además del color |

## 3. Tipografía

| Rol | Familia | Por qué |
|---|---|---|
| Interfaz y texto | **Atkinson Hyperlegible Next** (Google Fonts) | Diseñada por el Braille Institute para baja visión: distingue 1, l, I y 0, O, que en un expediente o un DUI importan |
| Datos clínicos, números de fila, expedientes, horas | **Atkinson Hyperlegible Mono** (Google Fonts) | Misma familia, cifras de ancho fijo para alinear valores y rangos |
| Respaldo nativo | Roboto (Android), SF Pro (iOS), sistema en web | Si la fuente no carga |

Escala (en px o sp; en iOS usar estilos de Dynamic Type equivalentes):

| Estilo | Tamaño y peso | Uso |
|---|---|---|
| Número de fila | Mono 64/700 | Pantalla "Mi turno", pantalla pública |
| Display | 32/700 | Título de pantalla web |
| Título 1 | 24/700 | Título de pantalla móvil |
| Título 2 | 20/700 | Secciones, tarjetas |
| Cuerpo | 16/400, interlineado 1.5 | Texto general (nunca menos de 16 en móvil) |
| Cuerpo fuerte | 16/700 | Etiquetas de valor |
| Dato | Mono 16/400 | Valores, unidades, rangos, horas |
| Nota | 14/400 | Ayudas, metadatos |
| Etiqueta | 12/700, mayúsculas, espaciado 0.06em | Encabezados de tabla, insignias |

## 4. Iconografía

- **Web y Android:** Material Symbols Rounded, relleno 0 y peso 400 por defecto, relleno 1 para el estado activo de la navegación.
- **iOS:** SF Symbols (nativos), peso regular.
- Tamaños: 20 en tablas y listas, 24 en navegación y botones, 32 o más en estados grandes (ambulancia, número de fila).
- Siempre con etiqueta de texto visible en navegación; en botones solo-ícono, nombre accesible.

Equivalencias principales (verificar el nombre exacto en el buscador de cada biblioteca):

| Concepto | Material Symbols | SF Symbols |
|---|---|---|
| Inicio o tablero | `dashboard` | `square.grid.2x2` |
| Paciente | `person` | `person.fill` |
| Personal | `badge` | `person.text.rectangle` |
| Cama | `bed` | `bed.double.fill` |
| Hospital | `local_hospital` | `cross.case.fill` |
| Emergencia o ambulancia | `emergency` | `staroflife.fill` |
| Laboratorio | `science` | `testtube.2` |
| Consulta | `stethoscope` | `stethoscope` |
| Signos vitales | `monitor_heart` | `waveform.path.ecg` |
| Citas | `calendar_month` | `calendar` |
| Turnos y horarios | `schedule` | `clock` |
| Fila del día | `confirmation_number` | `ticket` |
| Inventario | `inventory_2` | `shippingbox.fill` |
| Limpieza | `cleaning_services` | `sparkles` |
| Mantenimiento | `build` | `wrench.and.screwdriver.fill` |
| Ubicación | `location_on` | `location.fill` |
| Privacidad o candado | `lock` | `lock.fill` |
| Oculto | `visibility_off` | `eye.slash` |
| Auditoría | `history` | `clock.arrow.circlepath` |
| Alerta crítica | `warning` | `exclamationmark.triangle.fill` |
| Completado | `check_circle` | `checkmark.circle.fill` |
| Sin conexión | `wifi_off` | `wifi.slash` |
| Notificaciones | `notifications` | `bell.fill` |
| Ajustes | `settings` | `gearshape` |
| Cerrar sesión | `logout` | `rectangle.portrait.and.arrow.right` |

## 5. Espaciado, forma y elevación

- Retícula de 4: espacios 4, 8, 12, 16, 24, 32, 48.
- Radios: 6 en campos y chips, 10 en tarjetas, 16 en hojas inferiores móviles; píldora solo para estados.
- Elevación casi plana: borde de 1 px `border` en tarjetas; sombra suave solo en menús, diálogos y hojas.
- Objetivos táctiles de 48 × 48 dp en Android y 44 × 44 pt en iOS como mínimo; los botones de la app del paramédico, 64 de alto (se usan con guantes y en movimiento).

## 6. Componentes del sistema de diseño

Cada uno con estados normal, hover o presionado, foco, deshabilitado, cargando y error.

1. Botón primario, secundario, de texto y destructivo.
2. Campo de texto, campo de búsqueda con "motivo de coincidencia" en el resultado, selector, fecha y hora.
3. Insignia de estado (cama, ambulancia, laboratorio, fila) con color, ícono y texto.
4. Tarjeta de indicador (número grande, etiqueta, tendencia).
5. Fila de tabla con acciones (web) y fila de lista con acción al deslizar (móvil).
6. Tarjeta de cama para el plano por planta (código, estado, iniciales o "privado").
7. Valor de laboratorio: nombre, valor en mono, unidad, rango, marca alto, bajo o crítico.
8. Línea de tiempo de hitos (ambulancia, laboratorio).
9. Número de fila grande con "faltan N".
10. Banda de conexión ("Sin conexión, mostrando lo último guardado") y banda "actualizado en vivo".
11. Aviso de conflicto ("Otra persona tomó esta cama").
12. Estado vacío, error, sin permiso (con botón "Pedir acceso" donde aplica).
13. Aviso del 911 en la solicitud de ambulancia.
14. Navegación: barra lateral (web), barra inferior (Android, Material 3), barra de pestañas (iOS).

## 7. Adaptación por plataforma

| | Web (React) | Android (Compose) | iOS (SwiftUI) |
|---|---|---|---|
| Navegación | Barra lateral con secciones por rol | Barra inferior de 3 a 5 destinos | Tab bar de 3 a 5 pestañas |
| Acción principal | Botón en el encabezado | Botón flotante solo donde hay una acción dominante | Botón en la barra de navegación |
| Diálogos | Modal centrado | Hoja inferior | Sheet |
| Tipografía | Atkinson | Atkinson con Material type scale | Atkinson mapeada a Dynamic Type |
| Modo oscuro | Sí | Sí | Sí |

## 8. Prioridad de prototipos

1. Sistema de diseño (tokens, tipografía, componentes) en claro y oscuro.
2. Flujos de la defensa: F04 consulta y laboratorio, F05 admisión con la última cama, F07 ambulancia, F02 fila del día.
3. Pantallas del avance: ingreso y registro (todas), tablero web (W03), pacientes (W26, A30), personal (W07, W08), navegación principal de cada rol en Android e iOS.
4. Resto del inventario.

## 9. Indicación lista para pegar en Claude Design

> Diseña el sistema de diseño y los prototipos del "Sistema de Gestión Hospitalaria Universitaria (CLIMESA)": un ecosistema con panel web administrativo (React), app Android (Material 3) y app iOS (guías de Apple, SwiftUI) para un hospital universitario de 3 plantas: planta 1 consulta general, emergencia y laboratorio; planta 2 con 6 habitaciones semiprivadas de 2 camas (HAB-201 a HAB-206); planta 3 con 5 habitaciones VIP individuales (VIP-301 a VIP-305); una sola ambulancia. Todo se actualiza en vivo.
>
> Personalidad: sereno, legible y preciso; el color se reserva para estados. Tipografía Atkinson Hyperlegible Next para la interfaz y Atkinson Hyperlegible Mono para datos clínicos, números de fila y horas. Íconos Material Symbols Rounded en web y Android, SF Symbols en iOS.
>
> Tokens claro: bg #F4F7F8, surface #FFFFFF, ink #122028, muted #4E616B, border #D3DDE1, primary #0A6C70 (texto blanco encima), success #1D7444, warning #8F5300, danger #B3261E, info #1F55A3, violet #6A45A6, slate #4A5865, cada estado con su fondo suave (success-soft #E4F3EA, warning-soft #FBEFD9, danger-soft #FBE7E5, info-soft #E6EEFA, violet-soft #EFE9F8, slate-soft #E9EDF0, primary-soft #E3F2F1). Tokens oscuro: bg #0D161A, surface #142026, ink #E3ECEF, muted #9AADB5, border #28393F, primary #5CC3C7 (texto #0D161A encima), success #6CCB92, warning #E8B25E, danger #F2918A, info #8CB2F0, violet #BCA3EE, slate #AAB7C1.
>
> Estados: cama libre (success), ocupada (info, solo iniciales del paciente), reservada (violet), en limpieza (warning), bloqueada (slate con rayado y candado); ambulancia Disponible (success), En Servicio (danger), En Mantenimiento (slate); laboratorio Pendiente (slate), En Proceso (info), Completado (success), Cancelado (slate tachado), Revisado por médico (primary); valor crítico en danger con triángulo. Ningún estado depende solo del color: siempre texto e ícono.
>
> Empieza por el sistema de diseño (tokens, escala tipográfica, botones, campos, insignias de estado, tarjeta de cama, valor de laboratorio con rango, línea de tiempo, número de fila grande, banda sin conexión, aviso de conflicto, estados vacío, error y sin permiso) en claro y oscuro. Luego el tablero web del Jefe de Operaciones con ocupación por planta, estado de la ambulancia, laboratorio por estado y huecos de turnos; el plano de camas de las plantas 2 y 3; la app del paciente (mi turno en fila, citas, exámenes con valores ocultos hasta la revisión médica, pedir ambulancia con aviso del 911); la consulta del médico en iOS; y la app del paramédico en Android con botones grandes de hitos y envío sin conexión. Textos en español de El Salvador; datos de ejemplo ficticios.
