# JavaScript bridge: WebView finds these by name.
-keepclassmembers class com.yash.glyphstudio.share.ShareBridge { @android.webkit.JavascriptInterface <methods>; }

# Nothing Glyph SDK is a closed AAR that talks to a system service by class and method name.
-keep class com.nothing.ketchum.** { *; }
-dontwarn com.nothing.ketchum.**

# Ktor server: logging and JVM-only classes are referenced but absent on Android.
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn io.netty.**
-dontwarn reactor.blockhound.**
-dontwarn javax.naming.**
-keep class io.ktor.server.cio.** { *; }
-keep class kotlinx.coroutines.** { *; }
-keepclassmembers class kotlin.Metadata { *; }
