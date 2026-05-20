package com.priorli.triplane.feature.splash

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.priorli.triplane.common.theme.triplaneSansFamily
import kotlinx.coroutines.delay
import kotlin.math.tan

private const val SPLASH_HOLD_MS = 450L
private const val SPLASH_FADE_MS = 240

// PLACEHOLDER amber — visible "still using template defaults" signal.
// Remove during /init-app brand swap.
private val PLACEHOLDER_AMBER = Color(0xFFF59E0B)

/**
 * Full-screen branded splash sitting on top of the app for ~450ms after
 * cold start, then fading out. On Android the system SplashScreen API
 * shows the icon-only mark first, then this overlay adds the wordmark.
 * On iOS the native UILaunchScreen already shows mark + wordmark, so the
 * overlay continues the visual into the Compose layer.
 *
 * The placeholder amber dot is intentional — it's the visible "still using
 * template defaults" signal that survives until /init-app brand-swap runs.
 */
@Composable
fun SplashOverlay(modifier: Modifier = Modifier) {
    var visible by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        delay(SPLASH_HOLD_MS)
        visible = false
    }
    AnimatedVisibility(
        visible = visible,
        enter = EnterTransition.None,
        exit = fadeOut(tween(SPLASH_FADE_MS)),
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.padding(horizontal = 32.dp),
            ) {
                TriplaneMark(modifier = Modifier.size(120.dp))
                Text(
                    text = wordmark(),
                    fontFamily = triplaneSansFamily(),
                    fontSize = 40.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun wordmark(): AnnotatedString = buildAnnotatedString {
    append("triplane")
    withStyle(SpanStyle(color = PLACEHOLDER_AMBER)) { append(".") }
}

/**
 * Triplane placeholder mark — three stacked parallelograms with an amber
 * placeholder dot. Geometry mirrors `mobile/branding/generate-app-icons.ts`
 * and `androidMain/res/drawable/ic_launcher_foreground.xml`.
 *
 * Plane fill follows `MaterialTheme.colorScheme.primary` so the mark
 * auto-inverts in dark mode (the brand token in `tokens.json` flips
 * lightness for dark theme).
 */
@Composable
fun TriplaneMark(modifier: Modifier = Modifier) {
    val plane = MaterialTheme.colorScheme.primary
    Canvas(modifier = modifier) {
        val unit = size.minDimension / 64f
        scale(unit, Offset.Zero) {
            drawPlane(x = 14f, y = 14f, color = plane)
            drawPlane(x = 10f, y = 28f, color = plane)
            drawPlane(x = 6f, y = 42f, color = plane)
            // Amber dot — top-right of plane 3.
            drawCircle(
                color = PLACEHOLDER_AMBER,
                radius = 2.6f,
                center = Offset(51f, 18f),
            )
        }
    }
}

private const val PLANE_WIDTH = 36f
private const val PLANE_HEIGHT = 8f
private const val SKEW_X_DEG = -12f

/**
 * Draws a single skewed parallelogram in the 64-unit design grid, matching
 * the SVG `transform="translate(x y) skewX(-12)" rect 36×8` from the
 * generator. SVG `skewX(θ)` shifts the top edge by `h*tan(θ)`; we apply
 * the same shift manually here so the rendered shape matches pixel-for-pixel.
 */
private fun DrawScope.drawPlane(x: Float, y: Float, color: Color) {
    val shift = PLANE_HEIGHT * tan(SKEW_X_DEG * (kotlin.math.PI.toFloat() / 180f))
    // Negative shift since SKEW_X_DEG is negative — top edge moves right.
    val topLeft = Offset(x - shift, y)
    val topRight = Offset(x + PLANE_WIDTH - shift, y)
    val bottomRight = Offset(x + PLANE_WIDTH, y + PLANE_HEIGHT)
    val bottomLeft = Offset(x, y + PLANE_HEIGHT)
    val path = Path().apply {
        moveTo(topLeft.x, topLeft.y)
        lineTo(topRight.x, topRight.y)
        lineTo(bottomRight.x, bottomRight.y)
        lineTo(bottomLeft.x, bottomLeft.y)
        close()
    }
    drawPath(path, color = color)
}
