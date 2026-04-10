package com.priorli.triplane.shared.di

import com.priorli.triplane.shared.data.remote.api.ApiClient
import org.koin.core.qualifier.named
import org.koin.dsl.module

/**
 * Shared (KMM) Koin module — register the API client and any cross-platform
 * data-layer services here. Repository implementations and use cases get added
 * as you build features.
 *
 * Conventions:
 *   - The API base URL is provided per platform via `single(named("apiBaseUrl"))`
 *     in each platform's PlatformModule.
 *   - The AuthTokenProvider is also provided per platform.
 *   - Add repository registrations using `singleOf(::FooRepositoryImpl) bind FooRepository::class`
 *   - Add use case registrations using `singleOf(::SomethingUseCase)`
 */
val sharedModule = module {
    // API client — provides Ktor HttpClient + JSON serializer
    single { ApiClient(get(), get(named("apiBaseUrl"))).httpClient }
    single { ApiClient(get(), get(named("apiBaseUrl"))).json }

    // Add per-feature API classes, repository implementations, and use cases here
    // as you build features. See LESSONS.md § Clean Architecture for the pattern.
}
