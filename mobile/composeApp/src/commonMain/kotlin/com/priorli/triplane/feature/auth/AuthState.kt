package com.priorli.triplane.feature.auth

import androidx.compose.runtime.Composable

/**
 * Returns whether the user is currently signed in.
 * Android: reads from Clerk's userFlow.
 * iOS: stub (always false until Phase 12.7 adds Clerk iOS SDK).
 */
@Composable
expect fun rememberIsSignedIn(): Boolean

/**
 * Sign out the current user.
 */
expect suspend fun signOut()
