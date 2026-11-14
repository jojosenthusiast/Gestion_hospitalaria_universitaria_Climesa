plugins { id("com.google.dagger.hilt.android"); id("org.jetbrains.kotlin.kapt"); id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }

fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val climesaSupabaseUrl = providers.gradleProperty("CLIMESA_SUPABASE_URL")
    .getOrElse("https://gvmvmrusscsfbndnbvbr.supabase.co")
val climesaSupabasePublishableKey = providers.gradleProperty("CLIMESA_SUPABASE_PUBLISHABLE_KEY")
    .getOrElse("sb_publishable_7gL_lw2MMSwIFf_0nmHDzA_ILdkTI1T")
val climesaApiBaseUrl = providers.gradleProperty("CLIMESA_API_BASE_URL").getOrElse("http://10.0.2.2:3000/api/v1")
// Release never ships with an empty API URL: it defaults to the deployed API unless CLIMESA_API_BASE_URL overrides it.
val climesaReleaseApiBaseUrl = providers.gradleProperty("CLIMESA_API_BASE_URL").getOrElse("https://sghu-api.onrender.com/api/v1")
// Web app that hosts the pages opened from the Supabase emails (/confirmar-correo, /restablecer). Debug and release use the
// deployed web by default: a link in an email must open on any device, never on localhost.
val climesaWebUrl = providers.gradleProperty("CLIMESA_WEB_URL").getOrElse("https://sghu-web.onrender.com")

// TEMPORARY testing aid (docs/operacion/login-de-prueba.md): with -PCLIMESA_DEMO_LOGIN=true and the git-ignored
// ../demo-credenciales.json present, the login offers the fictitious test accounts (debug and release). Flag false
// (default) or file missing: DEMO_CREDENTIALS is empty, so the APK carries no credential. Turn off before delivery.
val climesaDemoLogin = providers.gradleProperty("CLIMESA_DEMO_LOGIN").map { it.toBoolean() }.getOrElse(false)
val climesaDemoCredentialsFile = rootProject.layout.projectDirectory.file("../demo-credenciales.json")
val climesaDemoCredentials = if (climesaDemoLogin) providers.fileContents(climesaDemoCredentialsFile).asText.orNull.orEmpty() else ""
if (climesaDemoLogin && climesaDemoCredentials.isBlank()) logger.warn("CLIMESA: CLIMESA_DEMO_LOGIN=true pero no existe ../demo-credenciales.json; el ingreso no mostrará cuentas de prueba.")

// Release signing comes only from Gradle properties (~/.gradle/gradle.properties) or environment variables, never
// from the repository. Without all four values the release APK is built unsigned (app-release-unsigned.apk).
fun releaseSetting(name: String): String? =
    (providers.gradleProperty(name).orNull ?: providers.environmentVariable(name).orNull)?.takeIf { it.isNotBlank() }
val releaseSigning = listOf(
    "CLIMESA_RELEASE_STORE_FILE", "CLIMESA_RELEASE_STORE_PASSWORD", "CLIMESA_RELEASE_KEY_ALIAS", "CLIMESA_RELEASE_KEY_PASSWORD",
).associateWith(::releaseSetting)
val releaseSigningReady = releaseSigning.values.all { it != null }
if (!releaseSigningReady && releaseSigning.values.any { it != null }) {
    logger.warn("CLIMESA: firma de release incompleta; faltan ${releaseSigning.filterValues { it == null }.keys}. Se genera un APK sin firmar.")
}

android {
    namespace = "sv.edu.catolica.climesa"
    compileSdk = 35
    defaultConfig {
        applicationId = "sv.edu.catolica.climesa"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0-core"
        buildConfigField("String", "SUPABASE_URL", buildConfigString(climesaSupabaseUrl))
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", buildConfigString(climesaSupabasePublishableKey))
        buildConfigField("String", "API_BASE_URL", buildConfigString(climesaApiBaseUrl))
        buildConfigField("String", "WEB_URL", buildConfigString(climesaWebUrl))
        buildConfigField("boolean", "DEMO_LOGIN", (climesaDemoLogin && climesaDemoCredentials.isNotBlank()).toString())
        buildConfigField("String", "DEMO_CREDENTIALS", buildConfigString(climesaDemoCredentials.lines().joinToString("")))
    }
    buildFeatures { compose = true; buildConfig = true }
    signingConfigs {
        if (releaseSigningReady) create("release") {
            storeFile = file(releaseSigning.getValue("CLIMESA_RELEASE_STORE_FILE")!!)
            storePassword = releaseSigning.getValue("CLIMESA_RELEASE_STORE_PASSWORD")
            keyAlias = releaseSigning.getValue("CLIMESA_RELEASE_KEY_ALIAS")
            keyPassword = releaseSigning.getValue("CLIMESA_RELEASE_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            buildConfigField("String", "API_BASE_URL", buildConfigString(climesaReleaseApiBaseUrl))
            // R8 shrinks and optimizes; proguard-rules.pro keeps names readable (no obfuscation).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseSigningReady) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
kapt { correctErrorTypes = true }
dependencies {
    implementation("com.google.dagger:hilt-android:2.57.1")
    kapt("com.google.dagger:hilt-android-compiler:2.57.1")
    implementation(platform("androidx.compose:compose-bom:2025.04.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")
    testImplementation("org.json:json:20240303")
}
