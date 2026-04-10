package com.priorli.triplane.feature.maps

/**
 * Open the platform's maps app pointed at the given coordinates.
 *
 * Android: launches an Intent with a `geo:` URI — Google Maps or any other
 *          map app picks it up.
 * iOS:    opens Google Maps if installed, otherwise falls back to Apple Maps.
 */
expect fun openExternalMap(latitude: Double, longitude: Double, label: String?)
