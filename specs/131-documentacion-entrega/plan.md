# 131. Plan

- README raíz y README por carpeta (`backend`, `web`, `android`, `ios`, `supabase`).
- PDF: Markdown de `docs/arquitectura` y `docs/decisiones` compilado con Pandoc y los diagramas Mermaid renderizados a imagen; script `tools/documento-arquitectura`.
- Guion de defensa: 15 minutos, cuatro flujos (paciente pide cita y la ve confirmada; consulta con orden de laboratorio hasta resultado revisado en el teléfono del paciente; última cama con conflicto en vivo; despacho de ambulancia con reporte previo a la llegada), más la demostración de concurrencia y de privacidad (médico no tratante bloqueado).
- `supabase/seed/reset-demo.sh` que reconstruye el entorno.
