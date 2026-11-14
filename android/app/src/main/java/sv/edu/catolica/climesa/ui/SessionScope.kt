package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.lifecycle.HasDefaultViewModelProviderFactory
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner

/**
 * Keeps the ViewModels of the signed-in account in their own store. The holder lives in the Activity store, so a
 * rotation keeps every screen's state; [end] (logout or expired session) and a different account clear the store,
 * which cancels each ViewModel's coroutines and realtime subscriptions and drops the previous user's data.
 */
class SessionStoreHolder : ViewModel() {
    private var owner: String? = null
    private var store = ViewModelStore()

    @Synchronized fun storeFor(userId: String): ViewModelStore {
        if (owner != userId) { store.clear(); store = ViewModelStore(); owner = userId }
        return store
    }

    @Synchronized fun end() { store.clear(); store = ViewModelStore(); owner = null }

    override fun onCleared() { store.clear() }
}

/** Every `viewModel()` inside [content] is created in the store of [userId]; Hilt's factory comes from the Activity. */
@Composable
fun SessionViewModelScope(holder: SessionStoreHolder, userId: String, content: @Composable () -> Unit) {
    val parent = checkNotNull(LocalViewModelStoreOwner.current) { "Sin ViewModelStoreOwner" }
    val owner = remember(holder, userId, parent) { SessionViewModelStoreOwner(holder.storeFor(userId), parent) }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner, content = content)
}

private class SessionViewModelStoreOwner(
    override val viewModelStore: ViewModelStore,
    private val parent: ViewModelStoreOwner,
) : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
    override val defaultViewModelProviderFactory: ViewModelProvider.Factory
        get() = (parent as? HasDefaultViewModelProviderFactory)?.defaultViewModelProviderFactory ?: ViewModelProvider.NewInstanceFactory()
    override val defaultViewModelCreationExtras: CreationExtras
        get() = (parent as? HasDefaultViewModelProviderFactory)?.defaultViewModelCreationExtras ?: CreationExtras.Empty
}
