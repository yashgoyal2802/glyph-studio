import java.util.Properties

plugins {
    id("com.android.application")
}

val keystoreProps = Properties()
val keystoreFile = System.getenv("GLYPH_KEYSTORE_PROPERTIES")?.let { File(it) } ?: rootProject.file("../../glyph-keys/keystore.properties")
if (keystoreFile.exists()) keystoreFile.inputStream().use { keystoreProps.load(it) }

android {
    namespace = "com.yash.glyphstudio"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.yash.glyphstudio"
        minSdk = 34
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
    }

    // The release key lives outside the project (see README "Releasing"). Debug builds never need it.
    signingConfigs {
        create("release") {
            if (keystoreProps.containsKey("storeFile")) {
                storeFile = File(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // -PnoMinify builds a release without R8, to tell a minification problem from an app problem.
            isMinifyEnabled = !project.hasProperty("noMinify")
            isShrinkResources = !project.hasProperty("noMinify")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    // Nothing's Glyph SDK is not in the repository (its licence does not allow redistribution); see README "Getting the Glyph SDK".
    val glyphSdk = file("libs/glyph-matrix-sdk-2.0.aar")
    if (!glyphSdk.exists()) {
        throw GradleException("Nothing's Glyph SDK is missing. Download it from https://github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit and save it as android/app/libs/glyph-matrix-sdk-2.0.aar (see README, \"Getting the Glyph SDK\").")
    }
    implementation(files(glyphSdk))

    // Embedded local server for the web editor (design.md decision 2).
    val ktor = "3.2.3"
    implementation("io.ktor:ktor-server-core:$ktor")
    implementation("io.ktor:ktor-server-cio:$ktor")
    implementation("io.ktor:ktor-server-websockets:$ktor")

    testImplementation("io.ktor:ktor-server-test-host:$ktor")
    testImplementation("io.ktor:ktor-client-websockets:$ktor")
    testImplementation("junit:junit:4.13.2")
    // Real org.json for JVM unit tests (the Android stub jar throws "not mocked").
    testImplementation("org.json:json:20250107")
}

// Build the web editor and bundle it into the app's assets (see design.md, decision 3).
val editorDir = rootProject.file("../editor")

val buildEditor = tasks.register<Exec>("buildEditor") {
    workingDir = editorDir
    val isWindows = System.getProperty("os.name").lowercase().contains("windows")
    commandLine(if (isWindows) listOf("cmd", "/c", "npm", "run", "build") else listOf("npm", "run", "build"))
    inputs.dir(editorDir.resolve("src"))
    inputs.files(
        editorDir.resolve("index.html"),
        editorDir.resolve("package.json"),
        editorDir.resolve("vite.config.ts"),
    )
    outputs.dir(editorDir.resolve("dist"))
}

val copyEditorAssets = tasks.register<Sync>("copyEditorAssets") {
    dependsOn(buildEditor)
    from(editorDir.resolve("dist"))
    into(layout.projectDirectory.dir("src/main/assets/editor"))
}

tasks.named("preBuild") { dependsOn(copyEditorAssets) }

// Fail early and clearly when the release key is missing, instead of producing an unsigned APK.
gradle.taskGraph.whenReady {
    if (allTasks.any { it.name.contains("Release") && it.project.path == ":app" && (it.name.startsWith("assemble") || it.name.startsWith("package")) }) {
        val sc = android.signingConfigs.getByName("release")
        if (sc.storeFile == null || !sc.storeFile!!.exists()) {
            throw GradleException("Release signing key not found. Put keystore.properties (and the .jks it names) in D:/AI Projects/glyph-keys/ or set GLYPH_KEYSTORE_PROPERTIES. See README, \"Releasing\".")
        }
    }
}
