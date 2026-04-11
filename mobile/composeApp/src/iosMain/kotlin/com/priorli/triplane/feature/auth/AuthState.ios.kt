package com.priorli.triplane.feature.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

@Composable
actual fun rememberIsSignedIn(): Boolean {
    val bridge = getClerkAuthBridge()
    var signedIn by remember { mutableStateOf(bridge?.isSignedIn() == true) }
    DisposableEffect(bridge) {
        if (bridge == null) {
            onDispose { }
        } else {
            val subscription = bridge.observeSignedIn { isSignedIn ->
                signedIn = isSignedIn
            }
            onDispose { subscription.close() }
        }
    }
    return signedIn
}

actual suspend fun signOut() {
    val bridge = getClerkAuthBridge() ?: return
    suspendCancellableCoroutine<Unit> { cont ->
        bridge.signOutAsync { cont.resume(Unit) }
    }
}
