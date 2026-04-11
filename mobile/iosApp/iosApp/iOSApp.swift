import SwiftUI
import ClerkKit
import ComposeApp

@main
struct iOSApp: App {
    init() {
        // Read publishable key from Info.plist (expanded from Config.xcconfig at build time).
        let publishableKey = Bundle.main.object(forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as? String ?? ""
        if !publishableKey.isEmpty {
            Clerk.configure(publishableKey: publishableKey)
            // Install the bridge only when Clerk is configured — otherwise
            // Clerk.shared.user access inside the bridge asserts in debug builds.
            // Without the bridge, Kotlin's rememberIsSignedIn() returns false
            // and AuthScreen.ios.kt renders the "bridge not installed" fallback.
            ClerkAuthBridgeKt.setClerkAuthBridge(bridge: ClerkAuthBridgeImpl())
        } else {
            print("[iOSApp] WARNING: CLERK_PUBLISHABLE_KEY not set. Fill it in mobile/iosApp/Configuration/Config.xcconfig and rebuild. Auth flow is disabled until then.")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView().ignoresSafeArea()
        }
    }
}
