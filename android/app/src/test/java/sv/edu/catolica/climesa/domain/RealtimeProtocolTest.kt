package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeProtocolTest {
    @Test fun construyeLaUrlDelSocketDesdeLaDireccionHttps() {
        assertEquals(
            "wss://ejemplo.supabase.co/realtime/v1/websocket?apikey=clave&vsn=1.0.0",
            RealtimeProtocol.websocketUrl("https://ejemplo.supabase.co/", "clave"),
        )
    }

    @Test fun launionALosCanalesPrivadosLlevaTokenYBanderaPrivada() {
        val privado = JSONObject(RealtimeProtocol.join("rol:ENF", "1", "token-ejemplo"))
        assertEquals("realtime:rol:ENF", privado.getString("topic"))
        assertEquals("phx_join", privado.getString("event"))
        assertEquals("token-ejemplo", privado.getJSONObject("payload").getString("access_token"))
        assertTrue(privado.getJSONObject("payload").getJSONObject("config").getBoolean("private"))
        val publico = JSONObject(RealtimeProtocol.join("publico", "2", "token-ejemplo"))
        assertFalse(publico.getJSONObject("payload").getJSONObject("config").getBoolean("private"))
    }

    @Test fun interpretaUnaDifusionDeCambioDeCama() {
        val texto = """{"topic":"realtime:area:2","event":"broadcast","ref":null,"payload":{"event":"cama.estado_cambiado","type":"broadcast","payload":{"tipo":"cama.estado_cambiado","entidad":"cama","id":"b1","version":7}}}"""
        val frame = RealtimeProtocol.parse(texto) as RealtimeFrame.Broadcast
        assertEquals("area:2", frame.channel)
        assertEquals(EventoDominio("cama.estado_cambiado", "cama", "b1", 7L), frame.event)
    }

    @Test fun reconoceLaRespuestaDeUnionYLosCierres() {
        assertEquals(RealtimeFrame.JoinReply("publico", true), RealtimeProtocol.parse("""{"topic":"realtime:publico","event":"phx_reply","payload":{"status":"ok","response":{}},"ref":"1"}"""))
        assertEquals(RealtimeFrame.JoinReply("rol:ENF", false), RealtimeProtocol.parse("""{"topic":"realtime:rol:ENF","event":"phx_reply","payload":{"status":"error"},"ref":"1"}"""))
        assertEquals(RealtimeFrame.ChannelClosed("rol:ENF"), RealtimeProtocol.parse("""{"topic":"realtime:rol:ENF","event":"phx_close","payload":{}}"""))
    }

    @Test fun ignoraLatidosYTextoMalFormado() {
        assertEquals(RealtimeFrame.Ignored, RealtimeProtocol.parse("""{"topic":"phoenix","event":"phx_reply","payload":{"status":"ok"}}"""))
        assertEquals(RealtimeFrame.Ignored, RealtimeProtocol.parse("no es json"))
    }

    @Test fun interpretaLaRecuperacionDeEventos() {
        val recuperado = RealtimeProtocol.parseCatchUp(JSONObject("""{"cursor":"42","events":[{"seq":"41","type":"cama.estado_cambiado","entity":"cama","id":"b1","version":3}]}"""))
        assertEquals("42", recuperado.cursor)
        assertEquals(listOf(EventoDominio("cama.estado_cambiado", "cama", "b1", 3L)), recuperado.events)
    }

    @Test fun elTableroTambienAtiendeEventosDeEspacio() {
        assertTrue(BedEvents.matches(EventoDominio("espacio.actualizado", "espacio", "e1", 2)))
        assertTrue(BedEvents.matches(EventoDominio("espacio.actualizado", "", "e1", 2)))
    }

    @Test fun cadaPantallaFiltraSusEntidades() {
        assertTrue(PatientEvents.matches(EventoDominio("paciente.actualizado", "paciente", "p1", 2)))
        assertFalse(PatientEvents.matches(EventoDominio("cama.estado_cambiado", "cama", "b1", 1)))
        assertTrue(ProfileEvents.matches(EventoDominio("usuario.actualizado", "usuario", "u1", 1)))
        assertFalse(ProfileEvents.matches(EventoDominio("paciente.actualizado", "paciente", "p1", 1)))
        val turno = EventoDominio("turno.publicado", "turno", "t1", 1)
        val personal = EventoDominio("personal.actualizado", "personal", "s1", 1)
        val ambulancia = EventoDominio("ambulancia.estado_cambiado", "ambulancia", "a1", 1)
        assertTrue(PortalEvents.matches("/turnos/mios", turno))
        assertTrue(PortalEvents.matches("/turnos/mios", personal))
        assertFalse(PortalEvents.matches("/turnos/mios", ambulancia))
        assertTrue(PortalEvents.matches("/ambulancia", ambulancia))
        assertTrue(PortalEvents.matches("/pacientes?limit=50", EventoDominio("paciente.creado", "paciente", "p2", 1)))
        assertTrue(PortalEvents.matches("/inicio", EventoDominio("cama.estado_cambiado", "cama", "b1", 1)))
        assertFalse(PortalEvents.matches(null, turno))
    }

    @Test fun elPlanDePacientesNoReemplazaUnaBusquedaActiva() {
        val ev = EventoDominio("paciente.actualizado", "paciente", "p1", 2)
        assertEquals(PatientEvents.Refresh.Detail("p1"), PatientEvents.refreshFor(ev, setOf("p1"), null, true))
        assertEquals(PatientEvents.Refresh.Detail("p1"), PatientEvents.refreshFor(ev, emptySet(), "p1", false))
        assertEquals(PatientEvents.Refresh.None, PatientEvents.refreshFor(ev.copy(id = "nuevo"), setOf("p1"), null, true))
        assertEquals(PatientEvents.Refresh.List, PatientEvents.refreshFor(ev.copy(id = "nuevo"), setOf("p1"), null, false))
        assertEquals(PatientEvents.Refresh.None, PatientEvents.refreshFor(EventoDominio("cama.x", "cama", "p1", 1), setOf("p1"), null, false))
    }

    @Test fun reconoceLaRespuestaDelLatidoYArmaAccessToken() {
        assertEquals(RealtimeFrame.HeartbeatReply("7"), RealtimeProtocol.parse("""{"topic":"phoenix","event":"phx_reply","payload":{"status":"ok"},"ref":"7"}"""))
        val frame = JSONObject(RealtimeProtocol.accessToken("rol:ENF", "9", "nuevo"))
        assertEquals("access_token", frame.getString("event"))
        assertEquals("realtime:rol:ENF", frame.getString("topic"))
        assertEquals("nuevo", frame.getJSONObject("payload").getString("access_token"))
    }
    @Test fun elTableroSoloAtiendeEventosDeCama() {
        assertTrue(BedEvents.matches(EventoDominio("cama.limpieza_pendiente", "cama", "b1", 1)))
        assertFalse(BedEvents.matches(EventoDominio("lab.estado_cambiado", "orden", "o1", 1)))
    }
}
