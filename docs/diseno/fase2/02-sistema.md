# Fase 2 · Etapa 2: sistema

Entregable fijo de la etapa 2 (`ui-ux-pro-max`). Aplica la dirección de `01-direccion-visual.md`. Código web:
`web/src/styles.css` (tokens), `web/src/modules.css` (estilos) y `web/src/components/system.tsx` (componentes).
Android e iOS copian los mismos valores de la tabla de la sección 7.

## 1. Áreas

Seis tonos de área y un neutro. Cada uno tiene un **tinte suave** (fondo de tarjeta o celda), un **color fuerte**
(franja superior de 3 px, chip del código, texto del área) y un **código** de tres letras. El rojo nunca es color de área.

| Código | Área | Espacios del edificio que lo usan |
|---|---|---|
| EMG | Emergencia | `P1-EMG` |
| CON | Consulta general | `P1-CON`, consultorios `C-10x` |
| LAB | Laboratorio | `P1-LAB`, `BOD-LAB` |
| HOS | Hospitalización | `P2-HOS`, `P3-VIP` |
| REC | Recepción y admisión | `P1-REC`, `P1-ESP` (sala de espera) |
| AMB | Ambulancia | `P1-AMB` |
| GEN | General (neutro) | `BOD-CEN` y todo lo que no tenga área |

Regla de uso: tarjeta o celda = `area-surface` (tinte + borde de 1 px al 35 % + franja superior fuerte) y el chip
`AreaTag` con el código. Las camas y habitaciones usan el mismo sistema. El filtro por área y la leyenda usan el mismo
`AreaTag`. Función de apoyo: `areaOf('P3-VIP')` devuelve `HOS`.

## 2. Estados

El estado lleva siempre **ícono + etiqueta + patrón**. El color acompaña, nunca va solo.

| Familia | Patrón | Ícono | Valores de la API que la usan |
|---|---|---|---|
| En espera | rayado diagonal | reloj | `en_espera`, `solicitada`, `pendiente`, `pendiente_cama`, `borrador`, `publicado`, `reservada`, `provisional`, `por_vencer`, `revisar` |
| Llamado o en proceso | punteado | megáfono | `llamado`, `confirmada`, `en_proceso`, `limpieza`, `reprogramada`, `bajo_minimo` |
| En atención o en uso | sólido | pulso | `en_atencion`, `en_curso`, `ocupada`, `hospitalizado`, `en_servicio`, `abierta` |
| Terminado o disponible | contorno | check | `atendida`, `atendido`, `completado`, `firmada`, `alta_firmada`, `egresado`, `libre`, `disponible`, `activo`, `exito`, `normal`, `aprobada`, `ok`, `coincide` |
| Cancelado o fuera de servicio | contorno discontinuo | cruz | `cancelado(a)`, `no_asistio`, `no_se_presento`, `cerrado`, `rechazada`, `vencida`, `vencido`, `bloqueada`, `inactivo`, `desactivado`, `denegado`, `fallido`, `en_mantenimiento`, `agotado` |
| Crítico | borde doble | alerta | `critico_alto`, `critico_bajo` |

Existencias (`agotado`, `bajo_minimo`, `por_vencer`, `ok`) y verificación de vinculación (`coincide`, `revisar`) usan la
misma tabla que Android; nunca rojo. Valores sin familia (`alto`, `bajo`, `sin_rango`) se muestran neutros, con un punto y su texto.
Componente web: `StatusBadge` (el `Tag` de siempre ahora lo usa, así que todas las vistas lo heredan).

**Escala de grises.** Los colores fuertes de las familias tienen casi la misma luminancia (8 a 13 % de luminancia
relativa), así que en gris el color no distingue nada: lo distinguen el patrón (rayas, puntos, relleno sólido, línea
continua, línea discontinua, línea doble) y el ícono. La prueba `web/src/__tests__/sistema-visual.test.tsx` exige que
cada familia tenga patrón e ícono propios. La captura visual en gris queda para la verificación de la etapa 6.

## 3. Prioridad

| Prioridad | Estilo | Ícono |
|---|---|---|
| Emergencia | relleno rojo crítico, texto claro | alerta |
| Urgente | tinte ámbar, borde y texto ámbar oscuro | doble flecha arriba |
| Rutina | tinte gris, texto gris | guion |

El rojo crítico (`--critical`) se usa solo para emergencia y valores críticos de laboratorio. Componente: `PriorityBadge`
(acepta `label`). El triage de ambulancia se lleva a esta escala: roja = emergencia, naranja y amarilla = urgente,
verde = rutina, conservando el nombre del color como etiqueta.
`StatusLegend` muestra áreas, estados y prioridad con las mismas piezas.

## 4. Tipografía, espaciado, radios y movimiento

- **Familia única:** Atkinson Hyperlegible Next para texto y Atkinson Hyperlegible Mono para códigos, números de ficha y
  horas, en web, Android e iOS. **Decisión iOS:** iOS deja DMSans y pasa a Atkinson (las fuentes ya están en
  `android/app/src/main/res/font/`; se copian a `ios/CLIMESA/Resources/` y se declaran en `Info.plist`), con
  `relativeTo:` para respetar Dynamic Type.
- **Cifras tabulares** (`font-variant-numeric: tabular-nums`) en tablas, horas, contadores, códigos e insignias.
- **Escala de texto (web):** 12, 13, 14, 15, 17, 20, 24 px (`--text-xs` a `--text-2xl`). Título de módulo: 20 px, peso 700.
- **Espaciado:** múltiplos de 4: `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40, `-12` 48 px.
- **Radios:** chip 4, control 6, tarjeta 10, panel 16 px. Anidados: radio interno = radio externo − padding (una tarjeta
  de 10 px con padding de 4 px lleva un chip interno de 6 px). Con padding mayor de 24 px, cada capa usa su propio token.
- **Movimiento:** `--motion-instant` 100, `--motion-fast` 160, `--motion-standard` y `--motion-emphasis` 200 ms, curva
  `--ease-out` `cubic-bezier(0.2, 0, 0, 1)`. Solo para confirmar una acción o mostrar a dónde fue algo. Nada anima al abrir
  un módulo (se quitó la entrada escalonada). El esqueleto es estático. `prefers-reduced-motion: reduce` deja la
  duración en 0,01 ms.

## 5. Patrones de pantalla

Toda pantalla usa uno. Todos empiezan con `CompactHeader` y tienen los mismos estados (esqueleto, vacío, error, sin
permiso, sin conexión).

| Patrón | Cuándo | Estructura |
|---|---|---|
| Lista + detalle | registros que se buscan y se abren (pacientes, personal, inventario, auditoría) | filtros en la barra; lista o tabla densa; detalle en panel lateral (web ancho) o pantalla siguiente (móvil) |
| Tablero | cosas que cambian de estado o lugar (fila, camas, edificio, cola de laboratorio, despacho) | columnas por estado o cuadrícula por área; tarjetas con `area-surface`, `StatusBadge` y número grande; leyenda arriba |
| Formulario | crear o editar (admisión, turno, invitación, resultado, signos) | una columna, etiqueta arriba, error bajo el campo, pasos si es largo; acción principal abajo, deshabilitada mientras envía |
| Panel del día | inicio por rol, mi día, mi consultorio, mi planta | lo de hoy arriba y grande, la siguiente acción como botón principal, el resto en secciones con su propio esqueleto |
| Bandeja de pendientes | lo que espera una acción (resultados por revisar, solicitudes, vinculaciones, avisos) | lista ordenada por prioridad y antigüedad; cada fila con su acción y "enterado"; vacía = mensaje de "al día" |

## 6. Reglas por plataforma

- **Web:** barra compacta (h1 único), menú lateral fijo en escritorio y cajón en móvil; el armazón no se desmonta;
  `useData` con caché en memoria por sesión y revalidación; división de código por ruta con precarga en reposo;
  foco visible de 2 px; objetivos de 40 px mínimo con puntero, 44 px en táctil.
- **Android (Material 3):** `TopAppBar` pequeña con título y una acción; `NavigationBar` de hasta 5 destinos; tarjetas
  con `area-surface` como `Surface` tintada + franja superior; objetivos de 48 dp; `ColorScheme` sin cambiar, tokens de
  área, estado y prioridad como extensión (`CompositionLocal`). Esqueletos con `Box` de alto real, sin `CircularProgressIndicator` de pantalla completa.
- **iOS (Apple HIG):** título en línea (`.navigationBarTitleDisplayMode(.inline)`), sin títulos grandes en pantallas de
  trabajo; `TabView` con hasta 5 pestañas; objetivos de 44 pt; Dynamic Type con `relativeTo:`; `.redacted(reason: .placeholder)`
  como esqueleto; respeta `accessibilityReduceMotion`.

## 7. Tabla de tokens para Android e iOS

Copiar tal cual. Nombre web (CSS) · Kotlin (`ui/theme/Color.kt`) · Swift (`DesignSystem/Theme.swift`, `Color`).

| Token web | Kotlin | Swift | Claro | Oscuro |
|---|---|---|---|---|
| `--area-emg` | `AreaEmg` | `areaEmg` | `#9B2C6F` | `#F09AC9` |
| `--area-emg-soft` | `AreaEmgSoft` | `areaEmgSoft` | `#FAEAF3` | `#3A1A2D` |
| `--area-con` | `AreaCon` | `areaCon` | `#0B6B63` | `#6FD1C3` |
| `--area-con-soft` | `AreaConSoft` | `areaConSoft` | `#E0F2EF` | `#10302C` |
| `--area-lab` | `AreaLab` | `areaLab` | `#5A3EA6` | `#BBA8F2` |
| `--area-lab-soft` | `AreaLabSoft` | `areaLabSoft` | `#EEEAFA` | `#2A2142` |
| `--area-hos` | `AreaHos` | `areaHos` | `#1D5C9A` | `#8DB9EC` |
| `--area-hos-soft` | `AreaHosSoft` | `areaHosSoft` | `#E4EEF8` | `#16273D` |
| `--area-rec` | `AreaRec` | `areaRec` | `#2D6B33` | `#8CCF93` |
| `--area-rec-soft` | `AreaRecSoft` | `areaRecSoft` | `#E4F1E5` | `#172F1A` |
| `--area-amb` | `AreaAmb` | `areaAmb` | `#5C6213` | `#CCD27A` |
| `--area-amb-soft` | `AreaAmbSoft` | `areaAmbSoft` | `#F0F2DA` | `#2C2E12` |
| `--area-gen` | `AreaGen` | `areaGen` | `#4A5865` | `#AAB7C1` |
| `--area-gen-soft` | `AreaGenSoft` | `areaGenSoft` | `#EDF0F2` | `#222B36` |
| `--on-area` | `OnArea` | `onArea` | `#FFFFFF` | `#0C1220` |
| `--status-espera` | `StatusEspera` | `statusEspera` | `#6A45A6` | `#BCA3EE` |
| `--status-espera-soft` | `StatusEsperaSoft` | `statusEsperaSoft` | `#F1EBFA` | `#2B2140` |
| `--status-llamado` | `StatusLlamado` | `statusLlamado` | `#8A5300` | `#E8B25E` |
| `--status-llamado-soft` | `StatusLlamadoSoft` | `statusLlamadoSoft` | `#FFF2D9` | `#33260E` |
| `--status-atencion` | `StatusAtencion` | `statusAtencion` | `#1F55A3` | `#8CB2F0` |
| `--status-atencion-soft` | `StatusAtencionSoft` | `statusAtencionSoft` | `#E8EFF9` | `#18284A` |
| `--status-listo` | `StatusListo` | `statusListo` | `#1D7444` | `#6CCB92` |
| `--status-listo-soft` | `StatusListoSoft` | `statusListoSoft` | `#E7F4EC` | `#13301F` |
| `--status-cerrado` | `StatusCerrado` | `statusCerrado` | `#4A5865` | `#AAB7C1` |
| `--status-cerrado-soft` | `StatusCerradoSoft` | `statusCerradoSoft` | `#EDF0F2` | `#222B36` |
| `--on-status` | `OnStatus` | `onStatus` | `#FFFFFF` | `#0C1220` |
| `--critical` | `Critical` | `critical` | `#B71C1C` | `#F2918A` |
| `--critical-soft` | `CriticalSoft` | `criticalSoft` | `#FCEAEA` | `#3A1A17` |
| `--priority-urgente` | `PriorityUrgente` | `priorityUrgente` | `#A3480A` | `#F0A36B` |
| `--priority-urgente-soft` | `PriorityUrgenteSoft` | `priorityUrgenteSoft` | `#FDEBDD` | `#3A2314` |
| `--priority-rutina` | `PriorityRutina` | `priorityRutina` | `#55617A` | `#9AA6BA` |
| `--priority-rutina-soft` | `PriorityRutinaSoft` | `priorityRutinaSoft` | `#EEF1F5` | `#1B2538` |

Espaciado (dp/pt = px): `Space1` 4, `Space2` 8, `Space3` 12, `Space4` 16, `Space5` 20, `Space6` 24, `Space8` 32,
`Space10` 40, `Space12` 48. Radios: `RadiusChip` 4, `RadiusControl` 6, `RadiusCard` 10, `RadiusPanel` 16. Movimiento:
`MotionInstant` 100, `MotionFast` 160, `MotionStandard` 200 ms. Íconos de estado: reloj, megáfono, pulso, check, cruz,
alerta (Material Symbols: `schedule`, `campaign`, `monitor_heart`, `check`, `close`, `warning`; SF Symbols: `clock`,
`megaphone`, `waveform.path.ecg`, `checkmark`, `xmark`, `exclamationmark.triangle`).

**Contraste comprobado** (WCAG 2.1, cálculo de luminancia relativa): color fuerte sobre su tinte ≥ 5,10:1 en claro y
≥ 6,24:1 en oscuro; texto `--on-area`/`--on-status` sobre color fuerte ≥ 5,78:1 en claro y ≥ 7,60:1 en oscuro. Todo AA.

## 8. Medición antes y después (web)

**Paquetes** (`npm run build`, Vite 6, minificado):

| Archivo | Antes (90fe78c) | Después |
|---|---|---|
| Paquete principal `app-*.js` | 662,38 kB (gzip 194,27 kB), con aviso de > 500 kB | 322,27 kB (gzip 99,40 kB), sin aviso |
| Módulos separados | ninguno | 16 archivos por ruta, de 6,3 kB (catálogo de laboratorio) a 82,8 kB (personal y turnos) |
| CSS principal `app-*.css` | 128,84 kB (gzip 22,81 kB) | 80,45 kB (gzip 15,50 kB); el CSS propio de cada módulo viaja con su archivo |

**Tiempo a contenido útil** (jsdom, API simulada con 300 ms de latencia, módulo Auditoría, tres corridas; mide el
armazón real `HospitalShell`):

| Momento | Antes | Después |
|---|---|---|
| Primera apertura del módulo | 327 a 339 ms | 328 a 331 ms |
| Volver a Inicio | 15 a 30 ms | 14 a 16 ms |
| Regresar al módulo ya visto | 315 a 322 ms (vuelve a esperar a la API) | 10 a 16 ms (dato en caché, revalida detrás) |

Tras el ingreso hay una sola pantalla de arranque ("Abriendo tu espacio de trabajo") en lugar de dos seguidas; el
reintento por servidor dormido no cambia. Falta medir en un navegador real contra la API desplegada (etapa 6).
