package com.priorli.triplane.feature.maps

import android.content.Context
import android.content.Intent
import android.net.Uri
import org.koin.mp.KoinPlatform

actual fun openExternalMap(latitude: Double, longitude: Double, label: String?) {
    val context: Context = KoinPlatform.getKoin().get()
    val encodedLabel = label?.let { Uri.encode(it) }
    // geo:lat,lng?q=lat,lng(label) — handled by Google Maps and other map apps
    val uri = if (encodedLabel != null) {
        Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude($encodedLabel)")
    } else {
        Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude")
    }
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(intent) }
        .onFailure { println("[Map] openExternalMap failed: ${it.message}") }
}
