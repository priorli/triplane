package com.priorli.triplane.common.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = androidx.compose.ui.graphics.Color(0xFF1A73E8),
    onPrimary = androidx.compose.ui.graphics.Color.White,
    primaryContainer = androidx.compose.ui.graphics.Color(0xFFD2E3FC),
    secondary = androidx.compose.ui.graphics.Color(0xFF5F6368),
    tertiary = androidx.compose.ui.graphics.Color(0xFF14b8a6),
    background = androidx.compose.ui.graphics.Color(0xFFFAFAFA),
    surface = androidx.compose.ui.graphics.Color.White,
    error = androidx.compose.ui.graphics.Color(0xFFEF4444),
)

@Composable
fun TriplaneTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = Typography(),
        content = content,
    )
}
