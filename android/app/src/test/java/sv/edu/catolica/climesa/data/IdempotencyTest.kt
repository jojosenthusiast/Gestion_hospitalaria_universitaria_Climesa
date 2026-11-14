package sv.edu.catolica.climesa.data

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class IdempotencyTest {
    private fun counter(): () -> String { var n = 0; return { "clave-${++n}" } }

    @Test fun retriesOfTheSameIntentReuseTheKeyEvenIfTheFormChanged() = runTest {
        val intent = SubmissionIntent(counter())
        val seen = mutableListOf<String?>()
        repeat(2) {
            try { intent.send { seen += currentCoroutineContext()[RequestIntent]?.idempotencyKey; throw AuthRequestException("Sin conexión.") } }
            catch (_: AuthRequestException) {}
        }
        try { intent.send { seen += currentCoroutineContext()[RequestIntent]?.idempotencyKey; throw AuthRequestException("Dato inválido.", 422) } }
        catch (_: AuthRequestException) {}
        intent.send { seen += currentCoroutineContext()[RequestIntent]?.idempotencyKey }
        assertEquals(listOf("clave-1", "clave-1", "clave-1", "clave-1"), seen)
        assertNull(intent.pendingKey)
    }

    @Test fun aNewIntentAfterSuccessGetsANewKey() = runTest {
        val intent = SubmissionIntent(counter())
        val first = intent.send { currentCoroutineContext()[RequestIntent]?.idempotencyKey }
        val second = intent.send { currentCoroutineContext()[RequestIntent]?.idempotencyKey }
        assertEquals("clave-1", first)
        assertEquals("clave-2", second)
    }

    @Test fun anIdempotencyConflictEndsTheIntent() = runTest {
        val intent = SubmissionIntent(counter())
        try { intent.send { throw AuthRequestException("Ya se usó.", 409, "idempotencia_conflicto") }; fail() }
        catch (e: AuthRequestException) { assertEquals(409, e.statusCode) }
        assertNull(intent.pendingKey)
        try { intent.send { throw AuthRequestException("Versión.", 409, "version_conflicto") } } catch (_: AuthRequestException) {}
        assertEquals("clave-2", intent.pendingKey)
    }

    @Test fun resetDiscardsAnUnsentIntent() {
        val intent = SubmissionIntent(counter())
        assertEquals("clave-1", intent.key())
        assertEquals("clave-1", intent.key())
        intent.reset()
        assertEquals("clave-2", intent.key())
    }

    @Test fun fallbackKeepsTheKeyOnlyWhileTheRequestHasNoDefinitiveAnswer() {
        val keys = IdempotencyKeys(newKey = counter())
        val first = keys.keyFor("POST/fila{}")
        keys.settle("POST/fila{}", null)
        assertEquals(first, keys.keyFor("POST/fila{}"))
        keys.settle("POST/fila{}", 503)
        assertEquals(first, keys.keyFor("POST/fila{}"))
        keys.settle("POST/fila{}", 429)
        assertEquals(first, keys.keyFor("POST/fila{}"))
        keys.settle("POST/fila{}", 409)
        assertNotEquals(first, keys.keyFor("POST/fila{}"))
        val again = keys.keyFor("POST/fila{}")
        keys.settle("POST/fila{}", 201)
        assertNotEquals(again, keys.keyFor("POST/fila{}"))
    }

    @Test fun fallbackMapIsBounded() {
        val keys = IdempotencyKeys(capacity = 3, newKey = counter())
        repeat(10) { keys.keyFor("POST/x$it") }
        assertEquals(3, keys.size())
    }
}
