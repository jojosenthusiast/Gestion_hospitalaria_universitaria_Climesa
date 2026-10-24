# ADR-0007. Concurrencia y recursión

**Estado:** Aceptada (17-oct-2026). Decisiones: D-013, D-054, D-062, D-063.

## Concurrencia: mecanismo por caso
| Caso | Garantía | Prueba |
|---|---|---|
| Dos personas asignan la misma cama | Restricción de exclusión sobre (cama, rango de tiempo) con `btree_gist` | Dos transacciones simultáneas; una confirma, la otra recibe "cama ocupada" y la siguiente sugerencia |
| Capacidad de habitación semiprivada | Una cama por ocupación y 2 camas por habitación en datos; regla de sexo y aislamiento validada con bloqueo `FOR UPDATE` de la habitación | Dos admisiones del sexo opuesto a la misma habitación vacía al mismo tiempo |
| Única ambulancia | Fila de la ambulancia bloqueada con `FOR UPDATE`; índice único parcial: un solo servicio activo por unidad | Dos despachos simultáneos; uno gana |
| Turnos traslapados | Exclusión sobre (persona, rango) | Dos turnos solapados creados a la vez |
| Número de fila del día | Secuencia por servicio y fecha con bloqueo de fila del contador | 50 emisiones simultáneas sin repetidos ni huecos |
| Doble clic o reintento | Idempotencia por clave | Misma orden dos veces devuelve el mismo resultado |
| Edición concurrente de un registro | Versión optimista (`version` entera) | Dos ediciones con la misma versión; la segunda recibe conflicto |

## Recursión
1. Edificio como árbol en `infra.espacio(id, padre_id, tipo)`: CTE recursiva para disponibilidad por planta y para la ruta "Planta 2 > HAB-203 > Cama B"; vista en árbol en web.
2. Catálogo de exámenes: un panel contiene exámenes o paneles; CTE recursiva expande una orden a sus exámenes hoja, con protección contra ciclos.
3. En clientes, componentes recursivos para pintar el árbol.
