# Fase 2 · Etapa 1: dirección visual

Entregable fijo de la etapa 1 (`design-taste-frontend`). Las etapas siguientes lo aplican y solo lo cambian con una
"propuesta de cambio" anotada en `odd/tasks/fase2-frontend.md`.

## Escena de uso

Una recepcionista atiende la ventanilla a media mañana, con la sala llena, en un monitor de 24 pulgadas bajo luz de
oficina. Mira la pantalla en ráfagas de dos o tres segundos, entre paciente y paciente. Un médico revisa su día en el
teléfono, de pie, entre dos consultas. Nadie lee la pantalla con calma: la escanea. Por eso el tema es claro (luz de
oficina), con modo oscuro equivalente para guardias nocturnas, y la densidad es alta pero ordenada.

## Principios

1. **El contenido manda.** La barra superior de cada módulo es compacta: ruta pequeña, título corto, filtros y una sola
   acción principal. Sin descripciones bajo el título. El primer dato útil aparece en el primer tercio de la pantalla.
2. **Denso pero tranquilo.** Mucha información por pantalla (tablas, filas de la fila, tarjetas de cama), separada por
   espacio y líneas de 1 px, no por cajas dentro de cajas. Un solo color de acento (azul CLIMESA `#0043B2`) para la
   acción principal y el foco. Tipos de texto: pocos tamaños, contraste por peso y no por tamaño gigante.
3. **El color significa algo.** El color de área identifica dónde (EMG, CON, LAB...), el patrón e ícono del estado dicen
   en qué paso está, y el rojo es solo para lo crítico. Nada se comunica solo con color.
4. **Rápido y estable.** El armazón nunca se desmonta; cada sección reserva su lugar con un esqueleto; lo ya visto se
   muestra al instante y se revalida en segundo plano. Nada salta de lugar cuando llegan los datos.
5. **Movimiento solo como respuesta.** 100 a 200 ms para confirmar una acción o mostrar a dónde fue algo. Nada anima al
   abrir un módulo. Con `prefers-reduced-motion` el movimiento se reduce a un cambio de opacidad o desaparece.

## Carácter tipográfico

Atkinson Hyperlegible Next (texto) y Atkinson Hyperlegible Mono (códigos, números de ficha, horas) en las tres
plataformas. Cifras tabulares en tablas, contadores y relojes. Títulos de módulo de 20 px, sin tracking agresivo.

## Prohibido

- Estética de landing page: héroes, títulos gigantes, frases de bienvenida, subtítulos que repiten el título.
- Tarjetas de color saturado completo, degradados, brillos, vidrio esmerilado, sombras decorativas.
- Rojo como color de área o de marca; rojo para algo que no sea crítico o emergencia.
- Estado comunicado solo con color (sin ícono ni etiqueta).
- Insignias de relleno ("Nuevo", "Beta"), etiquetas redundantes, itálicas al azar, monoespaciada fuera de códigos y números.
- Spinner de pantalla completa después del ingreso; texto "Cargando…" que reemplaza toda la sección.
- Animaciones de entrada al abrir un módulo, escalonados, rebotes, movimiento continuo decorativo.
- Modales para lo que se resuelve en el lugar; dobles confirmaciones para acciones reversibles.
- Emojis como íconos; mezclar familias de íconos o grosores de trazo.
- Texto en inglés o texto crudo del servidor en la interfaz.

## Nota sobre las reglas de las skills

Dos reglas genéricas de las skills no aplican porque el dueño decidió otra cosa: la tipografía (las skills sugieren
otras familias; se queda Atkinson por legibilidad clínica) y la "franja lateral" (prohibida por `impeccable`): la
franja de área es superior, de 3 px, más el código en un chip sólido, como pide la sección 6 del prompt.
