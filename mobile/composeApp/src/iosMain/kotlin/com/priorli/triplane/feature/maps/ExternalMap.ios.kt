package com.priorli.triplane.feature.maps

import platform.Foundation.NSURL
import platform.UIKit.UIApplication

actual fun openExternalMap(latitude: Double, longitude: Double, label: String?) {
    val app = UIApplication.sharedApplication
    val encodedLabel = label
        ?.replace(" ", "%20")
        ?.replace("&", "%26")
        ?: "Location"

    // Try Google Maps app first
    val gmapsUrl = NSURL.URLWithString(
        "comgooglemaps://?q=$latitude,$longitude($encodedLabel)&center=$latitude,$longitude",
    )
    if (gmapsUrl != null && app.canOpenURL(gmapsUrl)) {
        app.openURL(gmapsUrl, options = emptyMap<Any?, Any?>(), completionHandler = null)
        return
    }

    // Fallback: Apple Maps web URL → routes to Maps app on iOS
    val appleUrl = NSURL.URLWithString(
        "https://maps.apple.com/?q=$encodedLabel&ll=$latitude,$longitude",
    ) ?: return
    app.openURL(appleUrl, options = emptyMap<Any?, Any?>(), completionHandler = null)
}
