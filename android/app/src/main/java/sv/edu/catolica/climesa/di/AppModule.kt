package sv.edu.catolica.climesa.di
import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import sv.edu.catolica.climesa.BuildConfig
import sv.edu.catolica.climesa.data.*
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton fun auth(@ApplicationContext context:Context)=SupabaseAuthRepository(BuildConfig.SUPABASE_URL,BuildConfig.SUPABASE_PUBLISHABLE_KEY,SecureSessionStore(context))
    @Provides @Singleton fun backend()=BackendAccessRepository(BuildConfig.API_BASE_URL)
    @Provides @Singleton fun api(auth:SupabaseAuthRepository)=ApiClient(BuildConfig.API_BASE_URL,auth)
    @Provides @Singleton fun patients(api:ApiClient):PatientRepository=RemotePatientRepository(api)
}
