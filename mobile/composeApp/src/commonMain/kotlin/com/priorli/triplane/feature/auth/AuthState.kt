package com.priorli.triplane.feature.auth

import androidx.compose.runtime.Composable

/**
 * Returns whether the user is currently signed in.
 * Android: reads from Clerk's userFlow.
 * iOS: routes through ClerkAuthBridge (Phase 7) — Swift side owns Clerk iOS SDK.
 */
@Composable
expect fun rememberIsSignedIn(): Boolean

/**
 * Sign out the current user.
 */
expect suspend fun signOut()
