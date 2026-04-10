package com.priorli.triplane.feature.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.clerk.api.Clerk

@Composable
actual fun rememberIsSignedIn(): Boolean {
    val user by Clerk.userFlow.collectAsStateWithLifecycle()
    return user != null
}

actual suspend fun signOut() {
    Clerk.auth.signOut(null)
}
