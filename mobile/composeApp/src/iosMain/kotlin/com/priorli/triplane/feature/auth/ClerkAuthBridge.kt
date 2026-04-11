package com.priorli.triplane.feature.auth

import platform.UIKit.UIViewController

/**
 * Bridge interface implemented by the Swift side of the iOS app target.
 *
 * Clerk iOS SDK is Swift-only and cannot be called directly from Kotlin/Native.
 * The iOS app target links ClerkKit via Swift Package Manager, provides a
 * concrete `ClerkAuthBridgeImpl` that conforms to this protocol, and assigns
 * it via `setClerkAuthBridge(...)` at app startup (before the first Compose
 * content renders).
 *
 * Async results are delivered via SAM callback interfaces rather than Kotlin
 * `(T) -> Unit` lambdas so the boundary is explicit and debuggable from Swift.
 * Swift-side implementations must hop to `MainActor` before invoking callbacks
 * because the Kotlin side will update Compose state from them.
 */
interface ClerkAuthBridge {
    fun isSignedIn(): Boolean
    fun makeAuthViewController(onAuthenticated: AuthCompletionCallback): UIViewController
    fun getTokenAsync(onResult: TokenResultCallback)
    fun signOutAsync(onDone: AuthCompletionCallback)
    fun observeSignedIn(onChange: SignedInChangeCallback): AuthBridgeSubscription
}

fun interface AuthCompletionCallback {
    fun invoke()
}

fun interface TokenResultCallback {
    fun invoke(token: String?)
}

fun interface SignedInChangeCallback {
    fun invoke(isSignedIn: Boolean)
}

/**
 * Handle returned by [ClerkAuthBridge.observeSignedIn]. Compose `DisposableEffect`
 * calls `close()` when the observer leaves the hierarchy so the Swift side can
 * cancel its underlying Task.
 */
class AuthBridgeSubscription(private val onClose: () -> Unit) {
    fun close() {
        onClose()
    }
}

/**
 * Holder for the bridge instance. Swift code calls [setClerkAuthBridge] at app
 * startup. Kotlin code reads via [getClerkAuthBridge].
 *
 * Top-level property + accessor functions (rather than an `object`) sidestep
 * a Kotlin/Native ObjC-exporter edge case with mutable interface-typed fields.
 */
private var _clerkAuthBridge: ClerkAuthBridge? = null

fun setClerkAuthBridge(bridge: ClerkAuthBridge?) {
    _clerkAuthBridge = bridge
}

fun getClerkAuthBridge(): ClerkAuthBridge? = _clerkAuthBridge
