# Reglas R8 del build release de CLIMESA.
# Hilt, Compose, OkHttp y AndroidX traen sus propias reglas de consumidor; org.json es parte de Android.
# R8 reduce y optimiza, pero no renombra: los nombres de enum que guarda rememberSaveable (AndroidSection.name)
# y las trazas de error siguen legibles.
-dontobfuscate
-keepattributes SourceFile,LineNumberTable
