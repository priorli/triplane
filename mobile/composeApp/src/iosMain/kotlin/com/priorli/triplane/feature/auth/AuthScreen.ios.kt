package com.priorli.triplane.feature.auth

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitViewController

@Composable
actual fun AuthScreen(onAuthenticated: () -> Unit) {
    val bridge = getClerkAuthBridge()
    if (bridge == null) {
        Box(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "ClerkAuthBridge not installed.\nCheck iOSApp.swift — setClerkAuthBridge(...) must be called before first render.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        return
    }
    UIKitViewController(
        factory = { bridge.makeAuthViewController { onAuthenticated() } },
        modifier = Modifier.fillMaxSize(),
    )
}
