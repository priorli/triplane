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
        } else {
            print("[iOSApp] WARNING: CLERK_PUBLISHABLE_KEY not set — Clerk features will not work. Fill it in mobile/iosApp/Configuration/Config.xcconfig.")
        }

        // Install the bridge so Kotlin (Compose) code can call Clerk through us.
        // This must happen before any Compose content renders.
        ClerkAuthBridgeKt.setClerkAuthBridge(bridge: ClerkAuthBridgeImpl())
    }

    var body: some Scene {
        WindowGroup {
            ContentView().ignoresSafeArea()
        }
    }
}
