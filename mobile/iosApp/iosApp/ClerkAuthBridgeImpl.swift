import Foundation
import SwiftUI
import ClerkKit
import ClerkKitUI
import ComposeApp

/// Swift implementation of the Kotlin-defined `ClerkAuthBridge` protocol.
///
/// Token handling: every successful auth event writes the resulting JWT to
/// `NSUserDefaults` under the key `"clerk_token"` via `cacheCurrentToken()`.
/// The Kotlin `AuthTokenProvider` reads the same key synchronously through
/// `TokenStorage`, so the Ktor `defaultRequest`'s `runBlocking { getToken() }`
/// never has to cross the bridge — which avoids deadlocking the main thread
/// against the @MainActor Tasks it would be waiting on.
///
/// Auth state (`isSignedIn`/`observeSignedIn`) derives from the cached token,
/// NOT `Clerk.shared.user`. Clerk's local state can lag the server: after a
/// session is invalidated server-side, `Clerk.shared.user` stays non-nil for
/// some time AND `Clerk.shared.auth.signOut()` itself fails with `signed_out`.
/// The token cache is the single source of truth for "are we authenticated
/// for our API?".
class ClerkAuthBridgeImpl: NSObject, ClerkAuthBridge {

    private static let tokenKey = "clerk_token"
    private var refreshTask: Task<Void, Never>?
    private var eventTask: Task<Void, Never>?

    override init() {
        super.init()
        startTokenRefreshLoop()
        startAuthEventObserver()
    }

    deinit {
        refreshTask?.cancel()
        eventTask?.cancel()
    }

    func isSignedIn() -> Bool {
        Self.readToken() != nil
    }

    func makeAuthViewController(onAuthenticated: AuthCompletionCallback) -> UIViewController {
        let root = AuthScreenView {
            Task { @MainActor in
                await Self.cacheCurrentToken()
                onAuthenticated.invoke()
            }
        }
        return UIHostingController(rootView: root)
    }

    func getTokenAsync(onResult: TokenResultCallback) {
        // Kept for protocol completeness. The Ktor hot path reads
        // TokenStorage synchronously (see PlatformModule.ios.kt) so this is
        // currently unused; it would be the on-demand refresh entry point.
        DispatchQueue.main.async {
            Task { @MainActor in
                let token = try? await Clerk.shared.auth.getToken()
                Self.writeToken(token)
                onResult.invoke(token: token)
            }
        }
    }

    func signOutAsync(onDone: AuthCompletionCallback) {
        Task { @MainActor in
            do {
                try await Clerk.shared.auth.signOut()
            } catch {
                NSLog("[ClerkAuthBridge] signOut failed: %@", String(describing: error))
            }
            Self.writeToken(nil)
            onDone.invoke()
        }
    }

    func observeSignedIn(onChange: SignedInChangeCallback) -> AuthBridgeSubscription {
        let task = Task { @MainActor in
            var lastValue: Bool? = nil
            while !Task.isCancelled {
                let current = Self.readToken() != nil
                if current != lastValue {
                    lastValue = current
                    onChange.invoke(isSignedIn: current)
                }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
        }
        return AuthBridgeSubscription { task.cancel() }
    }

    // ─── Token cache + refresh loop ────────────────────────────────────────

    @MainActor
    private static func cacheCurrentToken() async {
        do {
            let token = try await Clerk.shared.auth.getToken()
            writeToken(token)
        } catch {
            NSLog("[ClerkAuthBridge] cacheCurrentToken failed: %@", String(describing: error))
            writeToken(nil)
            // Server-side signed_out — try a local sign-out so any stale Clerk
            // state clears. The signOut call itself may also fail; that's fine.
            if let apiError = error as? ClerkAPIError, apiError.code == "signed_out" {
                try? await Clerk.shared.auth.signOut()
            }
        }
    }

    private static func writeToken(_ token: String?) {
        let defaults = UserDefaults.standard
        if let token, !token.isEmpty {
            defaults.set(token, forKey: tokenKey)
        } else {
            defaults.removeObject(forKey: tokenKey)
        }
    }

    private static func readToken() -> String? {
        UserDefaults.standard.string(forKey: tokenKey)
    }

    /// Caches the JWT periodically as a safety net. Clerk's `tokenRefreshed`
    /// event (see `startAuthEventObserver`) is the primary source — Clerk
    /// emits a fresh token whenever the session is loaded or refreshed. This
    /// loop only matters if no event has fired in 30 s.
    ///
    /// `Clerk.shared.auth.getToken()` returns nil on no-session and throws
    /// `signed_out` on stale sessions; we don't gate the call so the first
    /// run happens at app startup before Clerk's user is loaded — letting us
    /// detect a stale Keychain-restored session before the home screen ever
    /// fires its first request.
    private func startTokenRefreshLoop() {
        refreshTask?.cancel()
        refreshTask = Task { @MainActor in
            while !Task.isCancelled {
                await Self.cacheCurrentToken()
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    /// Subscribes to Clerk's auth events. `tokenRefreshed` fires whenever the
    /// session-polling loop pulls a new JWT (which happens at startup once
    /// the client is restored, and again before each expiry); `signedOut`
    /// fires when the session is invalidated server-side.
    private func startAuthEventObserver() {
        eventTask?.cancel()
        eventTask = Task { @MainActor in
            for await event in Clerk.shared.auth.events {
                if Task.isCancelled { break }
                switch event {
                case .tokenRefreshed(let token):
                    Self.writeToken(token)
                case .signedOut:
                    Self.writeToken(nil)
                case .signInCompleted, .signUpCompleted, .sessionChanged:
                    await Self.cacheCurrentToken()
                case .accountDeleted:
                    Self.writeToken(nil)
                }
            }
        }
    }
}
