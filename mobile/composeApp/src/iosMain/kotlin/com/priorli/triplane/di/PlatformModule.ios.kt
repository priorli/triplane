package com.priorli.triplane.di

import com.priorli.triplane.common.TokenStorage
import com.priorli.triplane.shared.data.auth.AuthTokenProvider
import org.koin.core.qualifier.named
import org.koin.dsl.module

private class TokenStorageAuthProvider(private val tokenStorage: TokenStorage) : AuthTokenProvider {
    override suspend fun getToken(): String? = tokenStorage.getToken()
}

actual val platformModule = module {
    single { TokenStorage() }
    single<AuthTokenProvider> { TokenStorageAuthProvider(get()) }
    single(named("apiBaseUrl")) { "https://triplane.priorli.com" }
}
