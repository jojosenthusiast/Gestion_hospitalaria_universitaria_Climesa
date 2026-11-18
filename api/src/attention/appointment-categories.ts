/**
 * Categories of an appointment born from a request by reason (Fase 2 flujo A): the codes the patient chose in
 * `atencion.solicitud_cita`, resolved against `atencion.categoria_cita`. A rescheduled appointment keeps the
 * categories of the original one, so the chain `reprogramada_de` is walked back to the appointment the request
 * created. Appointments booked directly by reception have no request and return an empty array.
 *
 * `appointmentId` is a trusted SQL expression from the caller's own query (for example `c.id`), never user input.
 */
export const appointmentCategoriesSql = (appointmentId: string) => `(SELECT coalesce(json_agg(json_build_object('code',k.codigo,'name',k.nombre,'icon',k.icono)
        ORDER BY array_position(s.categorias,k.codigo)),'[]'::json)
      FROM atencion.solicitud_cita s JOIN atencion.categoria_cita k ON k.codigo = ANY(s.categorias)
      WHERE s.cita_id = (WITH RECURSIVE chain(id,prev,depth) AS (
          SELECT x.id,x.reprogramada_de,0 FROM atencion.cita x WHERE x.id=${appointmentId}
          UNION ALL SELECT x.id,x.reprogramada_de,chain.depth+1 FROM atencion.cita x JOIN chain ON x.id=chain.prev WHERE chain.depth<20)
        SELECT id FROM chain ORDER BY depth DESC LIMIT 1))`;
