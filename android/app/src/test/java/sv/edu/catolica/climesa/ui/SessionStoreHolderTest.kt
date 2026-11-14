package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackedViewModel : ViewModel() {
    var cleared = false
    override fun onCleared() { cleared = true }
}

class SessionStoreHolderTest {
    private val factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = TrackedViewModel() as T
    }
    private fun model(holder: SessionStoreHolder, user: String) = ViewModelProvider(holder.storeFor(user), factory)[TrackedViewModel::class.java]

    @Test fun theSameAccountKeepsItsViewModelsAcrossRecomposition() {
        val holder = SessionStoreHolder()
        val first = model(holder, "u1")
        assertSame(first, model(holder, "u1"))
        assertFalse(first.cleared)
    }

    @Test fun logoutClearsTheAccountViewModels() {
        val holder = SessionStoreHolder()
        val first = model(holder, "u1")
        holder.end()
        assertTrue(first.cleared)
        assertNotSame(first, model(holder, "u1"))
    }

    @Test fun anotherAccountNeverSeesThePreviousViewModels() {
        val holder = SessionStoreHolder()
        val first = model(holder, "u1")
        val second = model(holder, "u2")
        assertTrue(first.cleared)
        assertNotSame(first, second)
    }
}
