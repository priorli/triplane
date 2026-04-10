package com.priorli.triplane.shared.util

data class LatLng(val latitude: Double, val longitude: Double)

/**
 * Decodes a Google encoded polyline string into a list of LatLng points.
 * See: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
fun decodePolyline(encoded: String): List<LatLng> {
    val points = mutableListOf<LatLng>()
    var index = 0
    var lat = 0
    var lng = 0

    while (index < encoded.length) {
        var shift = 0
        var result = 0
        var b: Int
        do {
            b = encoded[index++].code - 63
            result = result or ((b and 0x1f) shl shift)
            shift += 5
        } while (b >= 0x20)
        lat += if (result and 1 != 0) (result shr 1).inv() else result shr 1

        shift = 0
        result = 0
        do {
            b = encoded[index++].code - 63
            result = result or ((b and 0x1f) shl shift)
            shift += 5
        } while (b >= 0x20)
        lng += if (result and 1 != 0) (result shr 1).inv() else result shr 1

        points.add(LatLng(lat / 1e5, lng / 1e5))
    }
    return points
}
