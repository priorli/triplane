package com.priorli.triplane.di

import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.priorli.triplane.BuildConfig
import com.priorli.triplane.common.TokenStorage
import com.priorli.triplane.shared.data.auth.AuthTokenProvider
import org.koin.core.qualifier.named
import org.koin.dsl.module

private class ClerkAuthTokenProvider : AuthTokenProvider {
    override suspend fun getToken(): String? {
        return when (val result = Clerk.auth.getToken(null)) {
            is ClerkResult.Success -> result.value
            else -> {
                println("[Auth] Clerk.getToken failed")
                null
            }
        }
    }
}

actual val platformModule = module {
    single { TokenStorage(get()) }  // kept for "is signed in?" check on iOS
    single<AuthTokenProvider> { ClerkAuthTokenProvider() }
    single(named("apiBaseUrl")) { BuildConfig.API_BASE_URL }
}
