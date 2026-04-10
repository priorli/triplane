package com.priorli.triplane.di

import org.koin.dsl.module

/**
 * Compose-side Koin module — register ViewModels and any composeApp-only services here.
 *
 * Phase 3 ships empty (no ViewModels in the scaffold). Add registrations as you build features:
 *
 *   import org.koin.core.module.dsl.viewModelOf
 *
 *   val appModule = module {
 *     viewModelOf(::ItemsViewModel)
 *     viewModelOf(::ItemDetailViewModel)
 *   }
 */
val appModule = module {
    // Register ViewModels with viewModelOf(::YourViewModel)
}
