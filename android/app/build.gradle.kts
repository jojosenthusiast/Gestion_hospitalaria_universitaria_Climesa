plugins {
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.kotlin.kapt)
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

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
    implementation(libs.hilt.android)
    kapt(libs.hilt.compiler)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.json)
}
