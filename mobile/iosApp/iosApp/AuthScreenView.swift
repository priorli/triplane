import SwiftUI
import ClerkKit
import ClerkKitUI

/// SwiftUI view that hosts Clerk's prebuilt AuthView and reports successful
/// sign-in up to the caller. Embedded via `UIHostingController` by
/// `ClerkAuthBridgeImpl.makeAuthViewController(...)`.
struct AuthScreenView: View {
    let onAuthenticated: () -> Void
    @Environment(Clerk.self) private var clerk

    var body: some View {
        AuthView()
            .onChange(of: clerk.user) { _, user in
                if user != nil {
                    onAuthenticated()
                }
            }
    }
}
