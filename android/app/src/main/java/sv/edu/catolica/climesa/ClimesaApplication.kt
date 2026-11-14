package sv.edu.catolica.climesa
import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import sv.edu.catolica.climesa.data.realtime.AppWakeups
@HiltAndroidApp
class ClimesaApplication:Application(){
    @Inject lateinit var wakeups:AppWakeups
    override fun onCreate(){
        super.onCreate()
        wakeups.install(this)
    }
}
