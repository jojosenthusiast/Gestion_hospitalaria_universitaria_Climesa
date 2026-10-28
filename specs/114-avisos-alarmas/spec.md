# 114. Avisos y alarmas

**Estado:** En revisión · **Semanas:** S3, S4 · **Depende de:** 100, 120, 121, 122 · **Investigación:** sistema de diseño (docs/diseno/claude-design/01-sistema-claro.html, sección Avisos y alarmas); IEC 60601-1-8 (forma de pulsos de prioridad alta); Joint Commission, Sentinel Event Alert 50 (fatiga de alarmas); WCAG 2.3.1; D-071, D-073

## Objetivo

Que lo crítico se imponga y lo demás no compita. Tres niveles de aviso con forma, sonido y obligación distintos, iguales en web, Android e iOS, alimentados por los eventos de tiempo real. El sistema no reemplaza las alarmas de los monitores junto a la cama: avisa de resultados, llegadas y tareas, y no es un dispositivo médico.

## Alcance
- Dentro: catálogo de eventos por nivel, aviso crítico a pantalla completa con confirmación, franja urgente, campana de atención, pausa de sonido, escalamiento si nadie confirma, estado "sesión por vencer", permisos de notificación por plataforma.
- Fuera: integración con monitores de signos o llamadores de enfermería (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-114-01 | El sistema debe clasificar cada evento que genera aviso en Crítico, Urgente o Atención según un catálogo configurable. | R | D-071 |
| FR-114-02 | Cuando llega un aviso Crítico, el cliente debe ocuparlo a pantalla completa con fondo rojo sólido, el valor en tipografía Mono y un sonido de 10 pulsos cada 10 s hasta que alguien confirme. | E | D-071; IEC 60601-1-8 |
| FR-114-03 | Cuando una persona confirma un aviso Crítico, el sistema debe registrar quién y cuándo, y pausar el sonido 2 minutos sin apagarlo. | E | D-071 |
| FR-114-04 | Si un aviso Crítico no se confirma en 5 minutos, entonces el sistema debe escalarlo al siguiente responsable del área (configurable). | E | D-071 |
| FR-114-05 | Cuando llega un aviso Urgente, el cliente debe mostrar una franja naranja fija arriba con Abrir y Entendido, con 3 pulsos una vez y otra vez a los 60 s si sigue sin atender. | R | D-071 |
| FR-114-06 | Los avisos de Atención deben sumarse al contador de la campana sin sonido. | R | D-071 |
| FR-114-07 | Ninguna animación de aviso debe parpadear más de 3 veces por segundo, y el pulso debe apagarse con "reducir movimiento". | R | WCAG 2.3.1 |
| FR-114-08 | Mientras quede 1 minuto de sesión por inactividad, el cliente debe mostrar la cuenta regresiva y permitir continuar. | R | D-073; privacidad.md 3.6 |
| FR-114-09 | En iOS, donde no haya permiso de Alertas críticas, la app debe usar notificación sensible al tiempo; en Android 14 o superior, debe pedir el permiso de pantalla completa y funcionar sin él. | E | D-071 |
| FR-114-10 | Los avisos nunca deben mostrar datos clínicos en la pantalla bloqueada ni en notificaciones push. | R | privacidad.md 3.3 |

## Escenarios de aceptación
1. **Valor crítico.** Dado potasio 6.4 mmol/L, cuando el laboratorista lo captura, entonces el médico ve el aviso a pantalla completa con sonido; al confirmar, el sonido se pausa 2 minutos y la confirmación queda registrada.
2. **Urgente.** Dada una solicitud de ambulancia por confirmar, entonces recepción ve la franja naranja con Abrir; si no la atiende, suena otra vez a los 60 s.
3. **Atención.** Dado un insumo bajo mínimo, entonces sube el contador de la campana sin sonido.

## Catálogo inicial
| Nivel | Eventos |
|---|---|
| Crítico | `lab.valor_critico` (médico), servicio de prioridad roja despachado (paramédico), posible brecha de datos (delegado) |
| Urgente | `ambulancia.solicitud_creada`, orden de laboratorio urgente, `fila.llamado` (paciente), `ambulancia.prehospital` (emergencia) |
| Atención | `inventario.bajo_minimo`, inscripción por vencer, `cama.limpieza_pendiente`, `acceso.solicitado` |
