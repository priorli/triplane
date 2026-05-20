package com.priorli.triplane.di

import com.priorli.triplane.common.TokenStorage
import com.priorli.triplane.shared.data.auth.AuthTokenProvider
import org.koin.core.qualifier.named
import org.koin.dsl.module

/**
 * Reads the current Clerk JWT from [TokenStorage] (NSUserDefaults under "clerk_token").
 *
 * The Swift-installed `ClerkAuthBridge` keeps that storage warm by writing the token after
 * every successful auth call and refreshing it via Clerk's auth-events stream + a periodic
 * background loop. We deliberately do NOT call back into Swift from here — the Ktor
 * `defaultRequest` block in [com.priorli.triplane.shared.data.remote.api.ApiClient] runs
 * synchronously on the calling coroutine's thread (Main on iOS), and a `runBlocking`
 * waiting on a `Task { @MainActor }` would deadlock the main thread against itself. See
 * LESSONS.md § "Pain: iOS auth deadlock — runBlocking on main + Swift @MainActor Task".
 */
private class ClerkBridgeAuthTokenProvider(
    private val storage: TokenStorage,
) : AuthTokenProvider {
    override suspend fun getToken(): String? = storage.getToken()
}

actual val platformModule = module {
    single { TokenStorage() }
    single<AuthTokenProvider> { ClerkBridgeAuthTokenProvider(get()) }
    single(named("apiBaseUrl")) { "https://triplane.priorli.com" }
}
