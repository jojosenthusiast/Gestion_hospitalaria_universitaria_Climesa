# R05. Órdenes, medicación, farmacia y enfermería

**Versión:** 1 (2026-10-13). **Alimenta:** spec clínica de órdenes y medicación (posterior a 003), inventario (R06) y cargos (006).

## 1. Conclusión

V4-04 y V7-03 describen bien el circuito (orden, validación, dispensación, administración, omisión, devolución, desperdicio) y advierten lo correcto: el código de barras confirma correspondencia de códigos, no que la dosis fue tomada. Esta revisión agrega tres cosas:

1. **Corrección institucional:** el regulador de medicamentos ya no es la DNM sino la **Superintendencia de Regulación Sanitaria (SRS)**, vigente desde el 7-ago-2024 (Decreto 891). Las referencias a la DNM en otras normas se leen como SRS (Art. 37 y 39). Eso cambia el destino de los libros de controlados y de los reportes.
2. **Evidencia cuantitativa de qué funciona y cómo falla:** CPOE, eMAR con código de barras, workarounds, fatiga de alertas, conciliación.
3. **Reglas de precio:** medicamentos con precio máximo de venta al público regulado y sin exención general de IVA (detalle en R14).

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V4 MED01 | Conciliación al ingreso/traslado/alta; "alergia desconocida ≠ sin alergias" | Se conserva |
| V4 MED02 | Orden con prescriptor real, dosis/unidad, vía, pauta, PRN con condiciones; orden verbal con read-back | Se conserva |
| V4 MED03 | Validación farmacéutica con cola, estados y reevaluación al cambiar la orden | Se conserva |
| V4 MED04 | Reserva y dispensación por lote; entregado ≠ administrado | Se conserva |
| V4 MED05-07 | Tareas versionadas, administración con momento real vs registro, omisiones con motivo | Se conserva |
| V4 MED08 | Devolución sin volver a disponible sin liberación; desperdicio con testigo | Se conserva |
| V4 MED09 | Medicamento propio del paciente fuera del inventario | Se conserva |
| V4 MED10 | Farmacovigilancia, desvío de controlados, contingencia | Se conserva; autoridad ahora SRS |
| V4 S418 | Lineamiento SRS de controlados 2025 "descarga 403" | Sigue pendiente (la página no expone el archivo) |
| V7 NUR01-05 | Plan, tareas, vigilancia, piel/caídas/dispositivos, relevo | Se conserva |
| V7 NUR01 | "No copiar NANDA/NIC/NOC sin licencia" | Se conserva y se precisa (sección 5) |
| V7 NUR03 | NEWS2 como candidato, sin alterar fórmula | Se conserva; umbrales verificados (sección 5) |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| Doc "Base investigativa": libro de controlados "autorizado por la DNM" | Ahora SRS (Decreto 891, Art. 39) |
| Reglamento de Estupefacientes DE 20 (2013) | Sigue vigente en lo que no contradiga la ley SRS (Art. 34); sus menciones a "Dirección" se leen como SRS |
| Asumir que el escaneo elimina errores | Corregido con Koppel 2008 (sección 6) |

## 4. Marco legal verificado

| Norma | Regla | Consecuencia |
|---|---|---|
| [Ley de la Superintendencia de Regulación Sanitaria, Decreto 891](https://www.srs.gob.sv/wp-content/uploads/2025/06/LEY-DE-SUPERINTENDENCIA-DE-REGULACION-SANITARIA-ACTUALIZADA-JUNIO-2025.pdf) (vigente desde 7-ago-2024, reformada en 2024 y 2025) | SRS autoriza establecimientos farmacéuticos, registra medicamentos, publica listas de venta libre y de controlados, fija precios máximos de venta al público, vigila farmacovigilancia y lleva registro de regentes (Art. 4, 22, 25, 26) | Catálogo de medicamentos con registro sanitario SRS, clasificación de control y precio máximo; regente registrado como responsable |
| Reglamento de Estupefacientes, Psicotrópicos y Precursores, DE 20 de 2013 | Recetario especial, un producto por receta, validez 30 días, libro diario de dispensación autorizado anualmente, botiquines hospitalarios con recetas propias, destrucción con presencia de la autoridad | Libro de controlados electrónico con saldo por producto, impresión para autorización, cierre anual; receta especial con folio |
| Lineamiento SRS para el manejo de medicamentos controlados en establecimientos de salud, v01 (16-oct-2025) | [Ficha leída](https://www.srs.gob.sv/?wpdmpro=lineamiento-para-el-manejo-de-medicamentos-controlados-en-establecimientos-de-salud); contenido no descargable desde aquí | **Pendiente crítico**: pedir el PDF a CLIMESA o a la SRS antes de especificar controlados |
| Ley de Medicamentos Art. 59 (citado en resolución DNM 2013) | Todo medicamento lleva impreso su precio máximo de venta al público; DNM (hoy SRS) y Defensoría verifican | El cargo de un medicamento no puede superar el precio máximo vigente (validación en spec 006). La Defensoría ya inspeccionó botiquines de hospitales privados ([informe 2016-2017](https://www.defensoria.gob.sv/wp-content/uploads/2017/10/informe.pdf)) |
| LDDPPSS Art. 13 b-c, 15 | Información de tratamiento y efectos adversos; consentimiento escrito | Medicamentos de investigación o alto riesgo con consentimiento cuando aplique |
| Ley IVA Art. 45 j, 46 a, 54 | No hay exención general de medicamentos; solo antirretrovirales adquiridos por el sector público | Medicamentos facturados por CLIMESA llevan IVA 13% (confirmar con contador) |

## 5. Estándares, terminologías y licencias

| Elemento | Hallazgo | Decisión |
|---|---|---|
| [ISMP High-Alert Medications in Acute Care, 2024](https://home.ecri.org/blogs/ismp-resources/high-alert-medications-in-acute-care-settings) | Lista vigente 2024 (clases no extraídas: descarga separada) | Catálogo configurable "alto riesgo" que exige doble verificación; contenido lo aprueba farmacia |
| [NEWS2, RCP](https://www.rcp.ac.uk/media/mrllczrj/news2-chart-4_clinical-response-to-news-trigger-thresholds_0.pdf) | 0: cada 12 h; 1-4: cada 4-6 h; 3 en un parámetro: cada hora y aviso inmediato; ≥5: cada hora y evaluación urgente; ≥7: monitoreo continuo y evaluación de emergencia | Implementable como regla versionada y nombrada "NEWS2" solo si se usa sin modificar; adultos, no embarazadas ni pediatría |
| [ICNP (CIE)](https://www.icn.ch/sites/default/files/inline-files/ICNP_Q%26A_October%202020.pdf) | Gratis para investigación; uso comercial con tarifa; integrado en SNOMED CT desde 2021 y gratuito en países miembros de SNOMED | El Salvador no es miembro: uso comercial requiere licencia de la CIE. NANDA-I también es licenciada. V1: catálogo de intervenciones propio de CLIMESA, mapeable después |
| [High 5s conciliación](https://www.safetyandquality.gov.au/sites/default/files/migrated/High-5s-Project-Assuring-Medication-Accuracy-at-transitions-of-Care-Aust-Int-Report.pdf) | BPMH en 24 h del ingreso; MR-1 (conciliados en 24 h) promedio ~49%, rango 9% a 98%; MR-3 meta < 0.3 discrepancias no intencionales por paciente | Indicadores MR-1 a MR-4 del módulo |

## 6. Evidencia empírica

| Estudio | Hallazgo | Implicación de diseño |
|---|---|---|
| Bates et al., JAMA 1998 ([PSNet](https://psnet.ahrq.gov/issue/effect-computerized-physician-order-entry-and-team-intervention-prevention-serious-medication)) | CPOE: −55% errores graves no interceptados | CPOE estructurado antes que cualquier otra automatización |
| Poon et al., NEJM 2010 ([PSNet](https://psnet.ahrq.gov/issue/effect-bar-code-technology-safety-medication-administration)) | eMAR con código de barras: −41% errores no relacionados con horario, −51% eventos adversos potenciales; cambios de flujo significativos | Circuito cerrado vale la inversión; cifras del artículo completo, verificar |
| [Koppel et al., JAMIA 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2442264) | 15 tipos de workaround y 31 causas: brazaletes pegados en carros, escanear un código dos veces, silenciar alarmas; overrides en 10.3% de administraciones; causas técnicas (códigos ilegibles, baterías, lentitud) y organizacionales | Medir overrides por motivo y unidad; códigos legibles en dosis unitaria; diseñar para que el camino correcto sea el más rápido; escanear solo el brazalete del paciente presente |
| van der Sijs et al., JAMIA 2006 | Overrides de alertas de seguridad entre 49% y 96% (cifra del resumen; texto completo no abierto) | Alertas por niveles; solo interrupción dura para lo grave; registrar motivo de override y revisar mensualmente |
| [Hospital Italiano de Buenos Aires](https://na.eventscloud.com/file_uploads/8f95280b0af93ca29f0921bb29f1851e_HospitalItalianodeBuenosAires.pdf) | 98% de recetas validadas por farmacia, 95% de administraciones con código de barras tras piloto en UCI en 2014 | Implementación gradual empezando por una unidad |

## 7. Requisitos derivados

1. Orden estructurada (medicamento, concentración, dosis, unidad, vía, frecuencia, PRN con condición y máximo) con versión; texto libre nunca reemplaza un campo crítico.
2. Validación farmacéutica obligatoria antes de dispensar, salvo urgencia bajo protocolo con validación posterior.
3. Alertas en tres niveles (informativa, requiere motivo, bloqueo) con motivo de override registrado e informe mensual.
4. Catálogo de alto riesgo con doble verificación independiente en administración.
5. Dispensación por lote con FEFO, dosis unitaria cuando aplique, y precio máximo vigente asociado al producto.
6. eMAR con escaneo de brazalete y dosis; registro de override del escaneo con motivo; indicador de workarounds.
7. Controlados: receta especial con folio, libro electrónico por producto con saldo, conciliación diaria, destrucción con acta y autoridad. Reglas finales tras leer el lineamiento SRS 2025.
8. Conciliación al ingreso con BPMH e indicadores MR-1 a MR-4; al alta, decisión por medicamento (continuar, modificar, suspender, iniciar).
9. NEWS2 como regla de vigilancia opcional y aprobada por dirección médica, con umbrales sin modificar.
10. Catálogo de intervenciones de enfermería propio; ICNP o NANDA solo con licencia.

## 8. Pendientes para CLIMESA

1. ¿Farmacia interna o botiquín? ¿Quién es el regente y está registrado en la SRS?
2. Copia del lineamiento SRS de controlados 2025 y del libro de controlados actual.
3. Lista de medicamentos de alto riesgo usada hoy, si existe.
4. Si existe dosis unitaria o se entrega por frasco/caja al servicio.
5. Cómo registra hoy enfermería la administración (kardex en papel).

## 9. Fuentes nuevas

[Ley SRS consolidada 2025](https://www.srs.gob.sv/wp-content/uploads/2025/06/LEY-DE-SUPERINTENDENCIA-DE-REGULACION-SANITARIA-ACTUALIZADA-JUNIO-2025.pdf) (leída); [ficha lineamiento SRS controlados](https://www.srs.gob.sv/?wpdmpro=lineamiento-para-el-manejo-de-medicamentos-controlados-en-establecimientos-de-salud) (ficha); [resolución DNM 2013 sobre Art. 59](https://transparencia.gob.sv/institutions/dnm/documents/117835/download) (leída); [Ley IVA](https://transparencia.mh.gob.sv/downloads/pdf/DC5828.pdf) (leída, Art. 45-46); [Koppel 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2442264) (leída); [NEWS2](https://www.rcp.ac.uk/media/mrllczrj/news2-chart-4_clinical-response-to-news-trigger-thresholds_0.pdf) (leída); [High 5s](https://www.safetyandquality.gov.au/sites/default/files/migrated/High-5s-Project-Assuring-Medication-Accuracy-at-transitions-of-Care-Aust-Int-Report.pdf) (leída); [ICNP Q&A](https://www.icn.ch/sites/default/files/inline-files/ICNP_Q%26A_October%202020.pdf) (leída); [ISMP 2024](https://home.ecri.org/blogs/ismp-resources/high-alert-medications-in-acute-care-settings) (ficha).
