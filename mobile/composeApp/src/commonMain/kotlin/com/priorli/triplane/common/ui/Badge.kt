package com.priorli.triplane.common.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

enum class BadgeVariant { Default, Secondary, Destructive, Outline }

@Composable
internal fun TriplaneBadge(
    text: String,
    modifier: Modifier = Modifier,
    variant: BadgeVariant = BadgeVariant.Default,
) {
    val (bg, fg, borderColor) = when (variant) {
        BadgeVariant.Default ->
            Triple(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary, Color.Transparent)
        BadgeVariant.Secondary ->
            Triple(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant, Color.Transparent)
        BadgeVariant.Destructive ->
            Triple(MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.onError, Color.Transparent)
        BadgeVariant.Outline ->
            Triple(Color.Transparent, MaterialTheme.colorScheme.onSurface, MaterialTheme.colorScheme.outline)
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = bg,
        contentColor = fg,
        border = if (borderColor != Color.Transparent)
            androidx.compose.foundation.BorderStroke(1.dp, borderColor) else null,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(PaddingValues(horizontal = 8.dp, vertical = 2.dp)),
        )
    }
}
