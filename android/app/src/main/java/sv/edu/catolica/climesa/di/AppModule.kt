package sv.edu.catolica.climesa.di
import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
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
    @Provides @Singleton fun realtime(auth:SupabaseAuthRepository,api:ApiClient):RealtimeRepository=SupabaseRealtimeRepository(
        websocketUrl=RealtimeProtocol.websocketUrl(BuildConfig.SUPABASE_URL,BuildConfig.SUPABASE_PUBLISHABLE_KEY),
        accessToken={auth.restoreSession()?.accessToken},
        catchUp={cursor->RealtimeProtocol.parseCatchUp(api.request("/eventos?after=$cursor") as JSONObject)},
        sockets=OkHttpRealtimeSocketFactory(),
    )
}
