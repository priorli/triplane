import Foundation
import SwiftUI
import ClerkKit
import ClerkKitUI
import ComposeApp

/// Swift implementation of the Kotlin-defined `ClerkAuthBridge` protocol.
///
/// Conforms to the protocol exported by the `ComposeApp.framework` Kotlin
/// framework. Clerk iOS is `@MainActor`-isolated, and Compose iOS renders on
/// the main thread, so we use `MainActor.assumeIsolated { ... }` for sync
/// bridge methods and `Task { @MainActor in ... }` for async ones. Every
/// async callback invocation hops back to the main actor before calling
/// Kotlin — Compose state updates must run on main.
class ClerkAuthBridgeImpl: NSObject, ClerkAuthBridge {

    func isSignedIn() -> Bool {
        MainActor.assumeIsolated {
            Clerk.shared.user != nil
        }
    }

    func makeAuthViewController(onAuthenticated: AuthCompletionCallback) -> UIViewController {
        let root = AuthScreenView {
            Task { @MainActor in
                onAuthenticated.invoke()
            }
        }
        return UIHostingController(rootView: root)
    }

    func getTokenAsync(onResult: TokenResultCallback) {
        Task { @MainActor in
            let token: String?
            do {
                token = try await Clerk.shared.auth.getToken()
            } catch {
                print("[ClerkAuthBridge] getToken failed: \(error)")
                token = nil
            }
            onResult.invoke(token: token)
        }
    }

    func signOutAsync(onDone: AuthCompletionCallback) {
        Task { @MainActor in
            do {
                try await Clerk.shared.auth.signOut()
            } catch {
                print("[ClerkAuthBridge] signOut failed: \(error)")
            }
            onDone.invoke()
        }
    }

    func observeSignedIn(onChange: SignedInChangeCallback) -> AuthBridgeSubscription {
        // Poll Clerk.shared.user on the main actor and emit on every change.
        // A future refinement could hook Clerk's own Combine publisher if one
        // is exposed.
        let task = Task { @MainActor in
            var lastValue: Bool? = nil
            while !Task.isCancelled {
                let current = Clerk.shared.user != nil
                if current != lastValue {
                    lastValue = current
                    onChange.invoke(isSignedIn: current)
                }
                try? await Task.sleep(nanoseconds: 250_000_000)  // 0.25s
            }
        }
        return AuthBridgeSubscription {
            task.cancel()
        }
    }
}
