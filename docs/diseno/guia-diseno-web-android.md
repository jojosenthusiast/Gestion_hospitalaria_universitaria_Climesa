# Guía de diseño astral clínico para Web y Android

Esta guía define la identidad visual y de interacción de CLIMESA para Web y Android. El objetivo es que el producto se sienta sereno, moderno y reconocible sin distraer de la seguridad, la privacidad ni la lectura clínica.

> **Decisión vigente:** D-082. La capa astral es ambiental, no semántica. Los estados clínicos conservan los significados de D-070 a D-073.

## Ruta rápida

1. Usá los tokens canónicos de esta guía; no agregués colores aislados en componentes.
2. Construí navegación por permisos: sidebar adaptativa en Web y barra inferior, drawer o rail en Android.
3. Aplicá movimiento solo para explicar continuidad, estado o jerarquía.
4. Reservá constelaciones, órbitas y SVG ambientales para ingreso, cabeceras, bienvenida y estados vacíos.
5. Verificá contraste, reducción de movimiento, privacidad y los ocho estados antes de cerrar una pantalla.

## 1. Autoridad y alcance

### Orden de autoridad

1. `docs/constitucion.md`: seguridad, privacidad, plataformas y reglas no negociables.
2. D-068 y D-070 a D-073 en `docs/decisiones/registro-decisiones.md`: marca, avisos y estados.
3. D-082 y esta guía: identidad astral clínica y comportamiento adaptativo.
4. `docs/diseno/claude-design/`: composición y referencia visual por pantalla.
5. `docs/arquitectura/datos/pantallas.csv`: existencia, propósito, nivel y roles de cada pantalla.
6. Specs y permisos: comportamiento y acciones permitidas.

Si dos fuentes se contradicen, prevalece la de mayor nivel. La guía no crea endpoints, permisos, campos ni pantallas.

### Plataformas incluidas

- Web: ADM, JOP, REC, LAB y DPD, además de la pantalla pública.
- Android: JOP, REC, AST, ENF, MED, LAB, PAR y PAC.
- iOS queda fuera de esta guía mientras esté postergado.

### Regla de autorización

Los menús y acciones se derivan de permisos efectivos recibidos desde `/auth/me`. Los nombres de rol sirven para escenarios de aceptación y organización visual, nunca como condición de seguridad.

## 2. Personalidad

CLIMESA debe sentirse:

- **Sereno:** evita ruido, sorpresa y movimiento constante.
- **Legible:** permite leer con prisa, a distancia y con iluminación variable.
- **Preciso:** distingue dato, unidad, estado, momento y responsable.
- **Humano:** usa lenguaje claro y evita presentar al paciente como un número.
- **Astral:** comunica orientación y conexión mediante profundidad, órbitas y constelaciones sutiles.

### Qué significa “astral”

Sí:

- fondos azul-negro en zonas de marca;
- puntos y líneas de constelación con opacidad baja;
- gradientes estáticos y suaves construidos solo con el azul CLIMESA;
- halos discretos para foco o selección;
- transiciones que muestran continuidad entre origen y destino;
- SVG propios, pequeños y accesibles.

No:

- estética de videojuego o ciencia ficción;
- estrellas como estados clínicos;
- neón detrás de texto o formularios;
- parallax, destellos o partículas permanentes;
- gradientes animados en tablas o datos;
- movimiento decorativo durante una emergencia;
- scroll secuestrado o acelerado artificialmente.

## 3. Tokens canónicos

Los nombres son conceptuales. Web los implementa como variables CSS y Android mediante `ColorScheme` y tokens Compose.

### Color

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `background` | `#F2F5F9` | `#0C1220` | Fondo general |
| `surface` | `#FFFFFF` | `#141C2D` | Tarjetas, tablas y hojas |
| `ink` | `#0E1B33` | `#E4EAF3` | Texto principal y estado ocupado |
| `muted` | `#55617A` | `#9AA6BA` | Texto secundario |
| `border-decorative` | `#D3DBE6` | `#28344C` | Divisores y bordes no funcionales |
| `primary-fill` | `#0043B2` | `#1D4FB8` | Campo de marca, acción primaria y selección |
| `primary-text` | `#0043B2` | `#8DB3FA` | Enlaces, iconos y foco sobre superficies |
| `primary-soft` | `#E6EEFB` | `#18284A` | Fondo seleccionado |
| `on-primary` | `#FFFFFF` | `#FFFFFF` | Contenido sobre `primary-fill` |
| `critical-fill` | `#B71C1C` | `#B71C1C` | Aviso crítico sólido |
| `critical-text` | `#B71C1C` | `#F2918A` | Texto crítico sobre superficies |
| `critical-soft` | `#FCEAEA` | `#3A1A17` | Fondo de valor crítico o ambulancia en servicio |
| `state-free` | `#1D7444` | `#6CCB92` | Libre, disponible, completado |
| `state-reserved` | `#6A45A6` | `#BCA3EE` | Reservada, solicitada, programada |
| `state-cleaning` | `#8A5300` | `#E8B25E` | Limpieza, por revisar, atención |
| `state-blocked` | `#4A5865` | `#AAB7C1` | Bloqueada, mantenimiento, pendiente |
| `state-process` | `#1F55A3` | `#8CB2F0` | En proceso o llamado |
| `state-urgent` | `#A3480A` | `#F0A36B` | Aviso urgente y prioridad 2 |

Estos valores reproducen los tokens medidos en `docs/diseno/claude-design/01-sistema-claro.html` y `02-sistema-oscuro.html`; D-082 no introduce una paleta de reemplazo.

Reglas:

- Ningún estado depende solo del color: siempre incluye palabra y, cuando ayuda, ícono o forma.
- `critical-*` no se usa como decoración ni marca. Los demás colores de estado conservan un único significado.
- La capa astral usa `primary-fill`, `primary-text`, `primary-soft`, `surface` e `ink` con opacidad; no crea colores semánticos.
- `border-decorative` no delimita controles ni comunica foco: para esos límites se usa un token funcional que alcance al menos 3:1 en la combinación final.
- Texto normal alcanza al menos 4.5:1; controles, foco e iconos funcionales, 3:1.

### Tipografía

| Token | Valor | Uso |
|---|---|---|
| `font-interface` | Atkinson Hyperlegible Next | Interfaz y texto |
| `font-data` | Atkinson Hyperlegible Mono | Expedientes, DUI, horas, unidades y cifras clínicas |
| `display` | 32/700, línea 1.15 | Título principal Web |
| `title-1` | 24/700, línea 1.25 | Título móvil |
| `title-2` | 20/700, línea 1.25 | Sección o tarjeta |
| `body` | 16/400, línea 1.5 | Texto general |
| `body-strong` | 16/700, línea 1.5 | Valores y acciones importantes |
| `data` | 16/400 mono, línea 1.4 | Datos y unidades |
| `note` | 14/400, línea 1.4 | Ayuda y metadatos |
| `label` | 12/700, línea 1.3 | Tabla, chip e insignia |

En Android el cuerpo nunca baja de 16 sp. Web limita párrafos a unas 70 columnas de texto.

### Espaciado y forma

- Retícula: 4, 8, 12, 16, 24, 32 y 48.
- Campo y chip: radio 6.
- Tarjeta: radio 10.
- Drawer y hoja inferior móvil: radio 16 en el borde expuesto.
- Píldora: solo insignias y estados.
- Controles táctiles Android: mínimo 48 × 48 dp.
- Controles de PAR en movimiento: mínimo 64 dp de alto.
- Elevación: borde antes que sombra; sombras solo en elementos flotantes.

### Profundidad astral

| Nivel | Tratamiento | Uso permitido |
|---|---|---|
| `space-0` | Fondo plano | Pantallas de datos |
| `space-1` | Gradiente estático tenue | Ingreso y cabecera de bienvenida |
| `space-2` | Puntos y líneas al 4–8% de opacidad | Estado vacío o bienvenida |
| `space-focus` | Halo único al 12–18% | Foco, selección o transición breve |

Una pantalla clínica nunca supera `space-0`. Una pantalla de marca puede combinar `space-1` y `space-2`.

## 4. Navegación Web

### Comportamiento adaptativo

| Ancho | Patrón |
|---|---|
| `>= 1200 px` | Sidebar expandida de 236–248 px |
| `768–1199 px` | Rail de 68–72 px con tooltip y nombre accesible |
| `< 768 px` | Barra superior y drawer modal |

### Estructura

1. Marca y entorno.
2. Destinos principales habilitados por permisos.
3. Grupo de operación o módulo.
4. Estado de conexión y sesión.
5. Perfil, apariencia y cierre de sesión.

La sidebar puede colapsarse, pero conserva:

- indicador de destino activo;
- etiqueta accesible;
- foco visible;
- orden estable;
- acceso por teclado;
- estado de conexión sin depender de color.

### Scroll

- La barra superior pasa de amplia a compacta después de 24 px de desplazamiento.
- La transición usa opacidad y altura; no mueve el contenido horizontalmente.
- Las tablas conservan encabezado fijo cuando mejora la comparación.
- `scroll-behavior: smooth` se limita a anclas y se desactiva con reducción de movimiento.
- No se intercepta la rueda, el gesto táctil ni las teclas Page Up/Page Down.

## 5. Navegación Android

### Comportamiento adaptativo

| Ventana | Patrón |
|---|---|
| Compacta | Barra inferior de 3 a 5 destinos |
| Media | Navigation rail y contenido flexible |
| Expandida | Rail o drawer persistente; lista-detalle cuando la tarea lo justifique |

Los destinos secundarios viven dentro del módulo o en un drawer. No se agregan pestañas para compensar una arquitectura confusa.

### Escenarios de los ocho roles

La tabla sirve para diseño y QA. La aplicación muestra solo destinos cuyo permiso esté vigente.

| Rol | Destino principal catalogado | Destinos secundarios catalogados |
|---|---|---|
| JOP | A26 Mis turnos | A10 Información del hospital, A12 Perfil y notificaciones |
| REC | A30 Buscar o registrar paciente | A31–A36, A26, A10, A12 |
| AST | A40 Mi consultorio | A41, A26, A10, A12 |
| ENF | A50 Mi planta | A41, A51–A54, A26, A10, A12 |
| MED | A20 Mi día | A21–A26, A10, A12 |
| LAB | A60 Cola de laboratorio | A61–A62, A26, A10, A12 |
| PAR | A70 Unidad | A71–A74, A26, A10, A12 |
| PAC | A04 Inicio del paciente | A05–A13 |

JOP no tiene todavía una pantalla operativa Android específica en `pantallas.csv`: su entrada usa únicamente destinos transversales ya catalogados. No se agregan “Planificación”, “Recursos” ni otras pantallas hasta que exista una decisión y una fila oficial. La selección exacta se obtiene por permiso, no por una lista rígida codificada por rol.

## 6. Movimiento

### Tokens

| Token | Duración | Uso |
|---|---|---|
| `motion-instant` | 100 ms | Presión y respuesta táctil |
| `motion-fast` | 160 ms | Tooltip, chip y cambio pequeño |
| `motion-standard` | 240 ms | Navegación, drawer y cambio de estado |
| `motion-emphasis` | 320 ms | Entrada de pantalla o éxito importante |

Curva recomendada: aceleración suave al salir y desaceleración clara al entrar. Una transición nunca retrasa una acción crítica.

### Patrones permitidos

- crossfade entre estados;
- desplazamiento de 8–16 px con opacidad;
- expansión y contracción de cabecera;
- drawer y rail con transición de ancho;
- cambio animado de número cuando no sea un dato crítico;
- skeleton o pulso suave para carga breve;
- confirmación visual única después de guardar.

### Patrones prohibidos

- autoplay permanente;
- rebotes en alertas o datos clínicos;
- parallax;
- scroll controlado por animación;
- más de tres destellos por segundo;
- animar todos los elementos de una lista;
- usar movimiento como única confirmación.

Con `prefers-reduced-motion` en Web o la preferencia equivalente en Android, duración y desplazamiento pasan a cero; se conserva solo el cambio de estado necesario.

## 7. SVG astral

### Usos

- fondo del ingreso;
- cabecera de bienvenida;
- estado vacío;
- ilustración de conexión o sincronización;
- identidad de módulo sin datos clínicos.

### Reglas técnicas

- `viewBox` obligatorio y dimensiones flexibles;
- `currentColor` cuando corresponda;
- SVG decorativo: `aria-hidden="true"` y sin foco;
- SVG funcional: nombre accesible y semántica equivalente;
- sin scripts, eventos inline, recursos remotos ni `foreignObject`;
- sin SMIL; animar contenedor o propiedades permitidas desde CSS/Compose;
- no incluir texto clínico dentro del SVG;
- limitar detalle y tamaño para no afectar arranque o scroll.

## 8. Componentes base

Cada componente implementa normal, foco, hover o presión, deshabilitado, cargando y error cuando corresponda.

1. Botón primario, secundario, texto y destructivo.
2. Campo, búsqueda, selector, fecha y hora.
3. Insignia semántica con palabra e ícono.
4. Tarjeta de indicador agregado.
5. Fila de tabla Web y fila de lista Android.
6. Tarjeta de cama con privacidad contextual.
7. Valor de laboratorio con unidad, rango y tendencia.
8. Línea de tiempo de ambulancia o laboratorio.
9. Número de fila y personas restantes.
10. Banda de conexión y recuperación.
11. Aviso de conflicto de concurrencia.
12. Estado vacío, error, sin permiso y sesión por vencer.
13. Diálogo o hoja de confirmación con consecuencias.
14. Sidebar, drawer, rail y barra inferior.

No se crea una variante visual si el componente existente puede expresar el caso mediante contenido, estado o densidad.

## 9. Ocho estados por pantalla

Toda pantalla contempla:

| Estado | Respuesta mínima |
|---|---|
| Cargando | Progreso identificable; conserva estructura cuando ayuda |
| Vacío | Explica qué falta y ofrece una acción válida |
| Error | Mensaje seguro, reintento y detalle técnico fuera de la UI |
| Sin permiso | No filtra datos; explica el acceso requerido sin prometerlo |
| Sin conexión | Indica qué información sigue disponible y cómo recuperar |
| En vivo | Confirma conexión sin animación permanente |
| Conflicto | Explica el cambio ajeno y recarga la versión vigente |
| Sesión por vencer | Advierte, permite continuar o cerrar y protege el trabajo |

## 10. Privacidad y seguridad visual

- El ingreso nunca confirma si un correo existe.
- Un dashboard muestra agregados, no datos personales.
- DUI, teléfono, expediente y datos clínicos se ocultan según permiso y contexto.
- Camas sin permiso muestran estado y, cuando corresponda, identidad enmascarada.
- El paciente no ve resultados que todavía requieran revisión médica.
- Los logs, errores y SVG no contienen tokens, credenciales ni contenido clínico.
- Las acciones destructivas muestran efecto, motivo y posibilidad de cancelar cuando aplique.

## 11. Accesibilidad

- Contraste AA: texto 4.5:1 y controles 3:1.
- Foco visible de 2 px con separación de 2 px.
- Orden de foco igual al orden visual.
- Navegación completa por teclado en Web.
- Etiquetas visibles; el placeholder no reemplaza la etiqueta.
- Iconos funcionales tienen nombre accesible.
- Estados usan texto, forma o ícono además del color.
- Escala de fuente no recorta acciones ni datos.
- TalkBack y lectores Web anuncian errores, carga y cambios importantes.
- Reducción de movimiento elimina animaciones no esenciales.

## 12. Migración desde la interfaz actual

La migración es incremental; no se rehace todo el producto en un solo cambio.

### Fase 1 — Fundaciones

- centralizar tokens claros y oscuros;
- cargar Atkinson Hyperlegible y Mono;
- alinear iconos Material Symbols Rounded;
- crear primitivas de superficie, texto, foco y estado.

### Fase 2 — Shell y navegación

- Web: sidebar adaptativa y barra superior compactable;
- Android: barra inferior, drawer y rail según ventana;
- estado de conexión, sesión y apariencia en el shell.

### Fase 3 — Componentes

- campos y botones;
- estados de pantalla;
- tarjetas, listas y tablas;
- componentes clínicos y de operación.

### Fase 4 — Capa astral

- ingreso;
- cabeceras de bienvenida;
- estados vacíos;
- transiciones y SVG aprobados.

### Fase 5 — Pantallas por tarea

Cada historia migra solo las pantallas que modifica. Pruebas, accesibilidad, estados y documentación viajan con el comportamiento.

## 13. Checklist de aceptación

### Visual

- [ ] Usa únicamente tokens canónicos.
- [ ] La capa astral no compite con contenido clínico.
- [ ] Claro y oscuro mantienen jerarquía y contraste.
- [ ] Tipografía mono identifica datos y unidades.

### Navegación

- [ ] El menú se deriva de permisos.
- [ ] Web responde como sidebar, rail o drawer según ancho.
- [ ] Android usa de 3 a 5 destinos principales.
- [ ] Los ocho roles Android tienen escenario verificable.
- [ ] No se inventó ninguna pantalla o permiso.

### Interacción

- [ ] Movimiento explica continuidad o estado.
- [ ] Reducción de movimiento funciona.
- [ ] Scroll, teclado y gesto nativo siguen disponibles.
- [ ] Carga y error no bloquean una salida segura.

### Seguridad y accesibilidad

- [ ] Contraste y objetivos táctiles cumplen mínimos.
- [ ] El foco y el lector de pantalla reciben mensajes útiles.
- [ ] Ningún estado depende solo del color.
- [ ] No se expone información sin permiso.
- [ ] No se incluyen secretos, tokens o datos reales.

## 14. Próximas aplicaciones

1. `121-T02`: shell Android y navegación por los ocho roles.
2. `113-T01-WEB`: tablero W03 y shell Web con sidebar adaptativa.
3. `102-T05-WEB/AND`: pacientes con componentes y estados compartidos conceptualmente.
4. Realtime: bandas de conexión, recuperación y estados en vivo.

La guía evoluciona mediante decisiones registradas. Cambiar un token semántico, patrón de navegación o regla de accesibilidad requiere actualizar D-082 o registrar una decisión posterior.
