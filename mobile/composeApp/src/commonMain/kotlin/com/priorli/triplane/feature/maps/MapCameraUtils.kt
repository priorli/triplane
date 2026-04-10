package com.priorli.triplane.feature.maps

import com.swmansion.kmpmaps.core.CameraPosition
import com.swmansion.kmpmaps.core.Coordinates
import com.swmansion.kmpmaps.core.MapBounds

/**
 * Build a [CameraPosition] that fits the supplied points in the viewport.
 *
 * - Empty: defaults to a centered world view.
 * - Single point: returns a coordinates+zoom position centered on the point.
 * - Multiple points: returns a [MapBounds]-based position that the underlying
 *   map engine will fit with appropriate padding.
 */
fun fitCameraTo(points: List<Coordinates>): CameraPosition {
    if (points.isEmpty()) {
        return CameraPosition(coordinates = Coordinates(0.0, 0.0), zoom = 1f)
    }
    if (points.size == 1) {
        return CameraPosition(coordinates = points[0], zoom = 14f)
    }
    var minLat = Double.POSITIVE_INFINITY
    var maxLat = Double.NEGATIVE_INFINITY
    var minLng = Double.POSITIVE_INFINITY
    var maxLng = Double.NEGATIVE_INFINITY
    for (p in points) {
        if (p.latitude < minLat) minLat = p.latitude
        if (p.latitude > maxLat) maxLat = p.latitude
        if (p.longitude < minLng) minLng = p.longitude
        if (p.longitude > maxLng) maxLng = p.longitude
    }
    // Pad bounds slightly so markers don't sit on the edge.
    val latPad = ((maxLat - minLat) * 0.15).coerceAtLeast(0.001)
    val lngPad = ((maxLng - minLng) * 0.15).coerceAtLeast(0.001)
    return CameraPosition(
        bounds = MapBounds(
            northeast = Coordinates(maxLat + latPad, maxLng + lngPad),
            southwest = Coordinates(minLat - latPad, minLng - lngPad),
        ),
    )
}
