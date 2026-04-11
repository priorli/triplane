// GENERATED FILE — DO NOT EDIT BY HAND.
// Source:    design/tokens.json
// Generator: bin/design-tokens.sh
//
// To change tokens: edit design/tokens.json, then run ./bin/design-tokens.sh
// and commit both files.

package com.priorli.triplane.common.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import org.jetbrains.compose.resources.Font
import triplanemobile.composeapp.generated.resources.Res
import triplanemobile.composeapp.generated.resources.nunito
import triplanemobile.composeapp.generated.resources.geistmono_regular
import triplanemobile.composeapp.generated.resources.geistmono_bold

// --- OKLch → sRGB ARGB conversion --------------------------------------------
// Based on the formulas from https://bottosson.github.io/posts/oklab/ —
// OKLch → OKLab → linear sRGB → gamma-compressed sRGB → 0xAARRGGBB long.
internal fun oklchToArgb(l: Double, c: Double, hDeg: Double): Long {
    val hRad = hDeg * (kotlin.math.PI / 180.0)
    val a = c * cos(hRad)
    val b = c * sin(hRad)

    val lL = (l + 0.3963377774 * a + 0.2158037573 * b).pow(3.0)
    val mL = (l - 0.1055613458 * a - 0.0638541728 * b).pow(3.0)
    val sL = (l - 0.0894841775 * a - 1.2914855480 * b).pow(3.0)

    var r =  4.0767416621 * lL - 3.3077115913 * mL + 0.2309699292 * sL
    var g = -1.2684380046 * lL + 2.6097574011 * mL - 0.3413193965 * sL
    var bc = -0.0041960863 * lL - 0.7034186147 * mL + 1.7076147010 * sL

    // Gamma-compress linear sRGB
    fun encode(v: Double): Double =
        if (v <= 0.0031308) 12.92 * v
        else 1.055 * v.pow(1.0 / 2.4) - 0.055

    r = encode(r).coerceIn(0.0, 1.0)
    g = encode(g).coerceIn(0.0, 1.0)
    bc = encode(bc).coerceIn(0.0, 1.0)

    val ri = (r * 255.0 + 0.5).toInt()
    val gi = (g * 255.0 + 0.5).toInt()
    val bi = (bc * 255.0 + 0.5).toInt()
    return 0xFF000000L or (ri.toLong() shl 16) or (gi.toLong() shl 8) or bi.toLong()
}

internal fun colorFromOklch(l: Double, c: Double, h: Double): Color =
    Color(oklchToArgb(l, c, h))

// --- Color schemes -----------------------------------------------------------

internal val LightColorScheme = lightColorScheme(
    primary = colorFromOklch(0.205, 0.0, 0.0),
    onPrimary = colorFromOklch(0.985, 0.0, 0.0),
    background = colorFromOklch(1.0, 0.0, 0.0),
    onBackground = colorFromOklch(0.145, 0.0, 0.0),
    surface = colorFromOklch(1.0, 0.0, 0.0),
    onSurface = colorFromOklch(0.145, 0.0, 0.0),
    surfaceVariant = colorFromOklch(0.97, 0.0, 0.0),
    onSurfaceVariant = colorFromOklch(0.556, 0.0, 0.0),
    outline = colorFromOklch(0.922, 0.0, 0.0),
    error = colorFromOklch(0.577, 0.245, 27.325),
    onError = colorFromOklch(0.985, 0.0, 0.0),
)

internal val DarkColorScheme = darkColorScheme(
    primary = colorFromOklch(0.9700, 0.0, 0.0),
    onPrimary = colorFromOklch(0.145, 0.0, 0.0),
    background = colorFromOklch(0.145, 0.0, 0.0),
    onBackground = colorFromOklch(0.985, 0.0, 0.0),
    surface = colorFromOklch(0.205, 0.0, 0.0),
    onSurface = colorFromOklch(0.985, 0.0, 0.0),
    surfaceVariant = colorFromOklch(0.269, 0.0, 0.0),
    onSurfaceVariant = colorFromOklch(0.708, 0.0, 0.0),
    outline = colorFromOklch(0.269, 0.0, 0.0),
    error = colorFromOklch(0.704, 0.191, 22.216),
    onError = colorFromOklch(0.985, 0.0, 0.0),
)

// --- Font families -----------------------------------------------------------
//
// Nunito is a variable-weight TTF — Compose picks the axis position from the
// FontWeight argument at render time. Geist Mono ships as static per-weight
// files.

@Composable
internal fun triplaneSansFamily(): FontFamily = FontFamily(
    Font(Res.font.nunito, FontWeight.Normal),
    Font(Res.font.nunito, FontWeight.Medium),
    Font(Res.font.nunito, FontWeight.SemiBold),
    Font(Res.font.nunito, FontWeight.Bold),
)

@Composable
internal fun triplaneMonoFamily(): FontFamily = FontFamily(
    Font(Res.font.geistmono_regular, FontWeight.Normal),
    Font(Res.font.geistmono_bold,    FontWeight.Bold),
)

// --- Typography --------------------------------------------------------------

@Composable
internal fun triplaneTypography(): Typography {
    val sans = triplaneSansFamily()
    return Typography(
        bodyLarge = TextStyle(
            fontFamily = sans,
            fontSize = 16.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight(400),
        ),
        bodyMedium = TextStyle(
            fontFamily = sans,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight(400),
        ),
        displayLarge = TextStyle(
            fontFamily = sans,
            fontSize = 57.sp,
            lineHeight = 64.sp,
            fontWeight = FontWeight(400),
        ),
        headlineLarge = TextStyle(
            fontFamily = sans,
            fontSize = 32.sp,
            lineHeight = 40.sp,
            fontWeight = FontWeight(400),
        ),
        labelMedium = TextStyle(
            fontFamily = sans,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight(500),
        ),
        titleLarge = TextStyle(
            fontFamily = sans,
            fontSize = 22.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight(500),
        ),
    )
}

// --- Shapes (radius scale) ---------------------------------------------------

internal val TriplaneShapes = Shapes(
    small = RoundedCornerShape(4.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)
