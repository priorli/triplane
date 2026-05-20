package com.priorli.triplane

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.clerk.api.Clerk
import com.priorli.triplane.di.appModule
import com.priorli.triplane.di.platformModule
import com.priorli.triplane.shared.di.sharedModule
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Must run before super.onCreate so the SplashScreen theme can swap
        // to the post-splash Theme.Triplane after first frame.
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Initialize Clerk SDK
        Clerk.initialize(
            applicationContext,
            BuildConfig.CLERK_PUBLISHABLE_KEY,
        )

        if (GlobalContext.getOrNull() == null) {
            startKoin {
                androidContext(applicationContext)
                modules(platformModule, sharedModule, appModule)
            }
        }

        enableEdgeToEdge()
        setContent {
            App()
        }
    }
}
