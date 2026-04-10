package com.priorli.triplane.common

import androidx.compose.ui.graphics.Color

/**
 * Generic color palette for use across the app — feature-agnostic.
 *
 * Add domain-specific palettes (e.g. transport mode colors, category colors) in
 * the relevant feature folder (`feature/<name>/Colors.kt`), not here.
 */

/** A 10-color palette suitable for grouping/distinguishing items by index. */
val PALETTE: List<Color> = listOf(
    Color(0xFFE63946),
    Color(0xFF457B9D),
    Color(0xFF2A9D8F),
    Color(0xFFE9C46A),
    Color(0xFFF4A261),
    Color(0xFF264653),
    Color(0xFFA8DADC),
    Color(0xFF6D6875),
    Color(0xFFB5838D),
    Color(0xFFFFB4A2),
)

/** Pick a stable color from the palette by index. Wraps modulo. */
fun colorAt(index: Int): Color =
    PALETTE[((index % PALETTE.size) + PALETTE.size) % PALETTE.size]
