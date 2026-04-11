package com.priorli.triplane.common.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

/**
 * Root Compose theme for Triplane. Reads the color scheme, typography, and
 * shapes from [DesignTokens.kt], which is regenerated from `design/tokens.json`
 * by `bin/design-tokens.sh`.
 *
 * Dark mode follows the system setting via [isSystemInDarkTheme]. An in-app
 * toggle could be added by threading a `darkTheme: Boolean?` override through
 * this composable and a user-setting store — a one-screen change, not wired
 * in v0.2.
 */
@Composable
fun TriplaneTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = triplaneTypography(),
        shapes = TriplaneShapes,
        content = content,
    )
}
