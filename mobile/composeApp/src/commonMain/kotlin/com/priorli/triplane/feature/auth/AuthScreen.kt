package com.priorli.triplane.feature.auth

import androidx.compose.runtime.Composable

@Composable
expect fun AuthScreen(onAuthenticated: () -> Unit)
