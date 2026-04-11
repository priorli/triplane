package com.priorli.triplane.di

import com.priorli.triplane.common.TokenStorage
import com.priorli.triplane.feature.auth.getClerkAuthBridge
import com.priorli.triplane.shared.data.auth.AuthTokenProvider
import kotlinx.coroutines.suspendCancellableCoroutine
import org.koin.core.qualifier.named
import org.koin.dsl.module
import kotlin.coroutines.resume

/**
 * Fetches a fresh JWT from Clerk on every request by routing through the Swift
 * ClerkAuthBridge. Returns null if the bridge isn't installed (e.g., during a
 * test harness without Swift init) or if Clerk hasn't yet issued a token.
 */
private class ClerkBridgeAuthTokenProvider : AuthTokenProvider {
    override suspend fun getToken(): String? {
        val bridge = getClerkAuthBridge() ?: return null
        return suspendCancellableCoroutine { cont ->
            bridge.getTokenAsync { token -> cont.resume(token) }
        }
    }
}

actual val platformModule = module {
    // TokenStorage kept for parity with Android, but the Clerk bridge is the
    // source of truth for auth on iOS — see ClerkBridgeAuthTokenProvider above.
    single { TokenStorage() }
    single<AuthTokenProvider> { ClerkBridgeAuthTokenProvider() }
    single(named("apiBaseUrl")) { "https://triplane.priorli.com" }
}
