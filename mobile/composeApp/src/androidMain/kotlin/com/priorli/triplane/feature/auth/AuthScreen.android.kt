package com.priorli.triplane.feature.auth

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.clerk.api.Clerk
import com.clerk.ui.auth.AuthView

@Composable
actual fun AuthScreen(onAuthenticated: () -> Unit) {
    val user by Clerk.userFlow.collectAsStateWithLifecycle()

    LaunchedEffect(user) {
        if (user != null) {
            println("[Auth] Clerk user signed in: ${user?.id}")
            onAuthenticated()
        }
    }

    AuthView(modifier = Modifier.fillMaxSize())
}
