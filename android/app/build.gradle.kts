plugins { id("com.google.dagger.hilt.android"); id("org.jetbrains.kotlin.kapt"); id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }

fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val climesaSupabaseUrl = providers.gradleProperty("CLIMESA_SUPABASE_URL")
    .getOrElse("https://gvmvmrusscsfbndnbvbr.supabase.co")
val climesaSupabasePublishableKey = providers.gradleProperty("CLIMESA_SUPABASE_PUBLISHABLE_KEY")
    .getOrElse("sb_publishable_7gL_lw2MMSwIFf_0nmHDzA_ILdkTI1T")
val climesaApiBaseUrl = providers.gradleProperty("CLIMESA_API_BASE_URL").getOrElse("http://10.0.2.2:3000/api/v1")

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
    }
    buildFeatures { compose = true; buildConfig = true }
    buildTypes {
        release {
            buildConfigField("String", "API_BASE_URL", buildConfigString(providers.gradleProperty("CLIMESA_API_BASE_URL").getOrElse("")))
            isMinifyEnabled = false
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
