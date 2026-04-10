package com.priorli.triplane.feature.auth

import androidx.compose.runtime.Composable

@Composable
actual fun rememberIsSignedIn(): Boolean = false

actual suspend fun signOut() {
    // TODO: Phase 12.7 — call Clerk iOS SDK signOut
}
