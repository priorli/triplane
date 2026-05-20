package com.priorli.triplane

import androidx.compose.ui.window.ComposeUIViewController
import com.priorli.triplane.di.appModule
import com.priorli.triplane.di.platformModule
import com.priorli.triplane.shared.di.sharedModule
import org.koin.core.context.startKoin
import org.koin.mp.KoinPlatform

// iOS entry point. Mirrors what MainActivity.onCreate does on Android — Koin must be
// started before Compose composes anything that resolves a Koin scope (which on this
// stack is "everything", since koin-compose-viewmodel touches LocalKoinScope eagerly).
//
// Idempotent guard: ComposeUIViewController is invoked per UIWindow, so wrapping the
// startup in `if (!started)` keeps reattaches (e.g. scene rebuilds) safe. KoinPlatform
// is the canonical accessor on iOS targets in koin 4.2.x — `GlobalContext.getOrNull()`
// is not always re-exported via koin-core on iOS, even though it works on Android.
fun MainViewController() = ComposeUIViewController {
    val started = runCatching { KoinPlatform.getKoin() }.isSuccess
    if (!started) {
        startKoin {
            modules(platformModule, sharedModule, appModule)
        }
    }
    App()
}
