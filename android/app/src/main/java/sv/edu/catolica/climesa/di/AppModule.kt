package sv.edu.catolica.climesa.di
import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.json.JSONObject
import sv.edu.catolica.climesa.BuildConfig
import sv.edu.catolica.climesa.data.*
import sv.edu.catolica.climesa.data.realtime.*
import sv.edu.catolica.climesa.domain.RealtimeProtocol
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton fun auth(@ApplicationContext context:Context)=SupabaseAuthRepository(BuildConfig.SUPABASE_URL,BuildConfig.SUPABASE_PUBLISHABLE_KEY,SecureSessionStore(context))
    @Provides @Singleton fun backend()=BackendAccessRepository(BuildConfig.API_BASE_URL)
    @Provides @Singleton fun api(auth:SupabaseAuthRepository)=ApiClient(BuildConfig.API_BASE_URL,auth)
    @Provides @Singleton fun patients(api:ApiClient):PatientRepository=RemotePatientRepository(api)
    @Provides @Singleton fun beds(api:ApiClient):BedRepository=RemoteBedRepository(api)
    @Provides @Singleton fun roleSource(api:ApiClient):sv.edu.catolica.climesa.ui.RoleDataSource=object:sv.edu.catolica.climesa.ui.RoleDataSource{
        override suspend fun get(path:String):Any=api.request(path)
        override suspend fun post(path:String,body:JSONObject):Any=api.request(path,"POST",body)
    }
    @Provides @Singleton fun planningSource(api:ApiClient):sv.edu.catolica.climesa.ui.PlanningDataSource=object:sv.edu.catolica.climesa.ui.PlanningDataSource{
        override suspend fun get(path:String):Any=api.request(path)
        override suspend fun send(path:String,method:String,body:JSONObject):Any=api.request(path,method,body)
    }
    /** Un solo socket para toda la app: los ViewModels que piden los mismos canales lo comparten. */
    @Provides @Singleton fun realtime(auth:SupabaseAuthRepository,api:ApiClient):RealtimeRepository=SharedRealtime(
        upstream=SupabaseRealtimeRepository(
            websocketUrl=RealtimeProtocol.websocketUrl(BuildConfig.SUPABASE_URL,BuildConfig.SUPABASE_PUBLISHABLE_KEY),
            accessToken={auth.restoreSession()?.accessToken},
            catchUp={cursor->RealtimeProtocol.parseCatchUp(api.request("/eventos?after=$cursor") as JSONObject)},
            sockets=OkHttpRealtimeSocketFactory(),
        ),
        scope=CoroutineScope(SupervisorJob()+Dispatchers.Default),
    )
}

