package com.priorli.triplane.feature.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Visual exercise of every design-system token. Mirrors `web/src/app/[locale]/(app)/design/page.tsx`
 * so flipping the simulator/device's dark mode shows the palette rotate in both
 * places identically.
 *
 * Deliberately `internal` per Phase 7's Kotlin/Native ObjC-exporter workaround —
 * Swift doesn't need to see this screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DesignShowcaseScreen(onBack: () -> Unit) {
    var dialogOpen by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Design") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Design system",
                        style = MaterialTheme.typography.headlineLarge,
                    )
                    Text(
                        text = "Every token, type scale, radius, and sample component that ships with Triplane. Flip the device's dark mode to see the palette rotate.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                SectionHeader("Colors")
                ColorSwatches()
            }

            item {
                SectionHeader("Typography")
                TypographyRamp()
            }

            item {
                SectionHeader("Radii")
                RadiusSamples()
            }

            item {
                SectionHeader("Sample components")
                SampleComponents(onOpenDialog = { dialogOpen = true })
            }
        }
    }

    if (dialogOpen) {
        AlertDialog(
            onDismissRequest = { dialogOpen = false },
            title = { Text("Sample dialog") },
            text = { Text("Dialog consumes design-system tokens via MaterialTheme.") },
            confirmButton = {
                TextButton(onClick = { dialogOpen = false }) { Text("Close") }
            },
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(bottom = 12.dp),
    )
}

private data class ColorToken(val name: String, val color: Color, val onColor: Color)

@Composable
private fun ColorSwatches() {
    val scheme = MaterialTheme.colorScheme
    val tokens = listOf(
        ColorToken("primary", scheme.primary, scheme.onPrimary),
        ColorToken("onPrimary", scheme.onPrimary, scheme.primary),
        ColorToken("background", scheme.background, scheme.onBackground),
        ColorToken("onBackground", scheme.onBackground, scheme.background),
        ColorToken("surface", scheme.surface, scheme.onSurface),
        ColorToken("onSurface", scheme.onSurface, scheme.surface),
        ColorToken("surfaceVariant", scheme.surfaceVariant, scheme.onSurfaceVariant),
        ColorToken("onSurfaceVariant", scheme.onSurfaceVariant, scheme.surfaceVariant),
        ColorToken("outline", scheme.outline, scheme.background),
        ColorToken("error", scheme.error, scheme.onError),
        ColorToken("onError", scheme.onError, scheme.error),
    )
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.height(540.dp),
    ) {
        items(tokens, key = { it.name }) { token ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .background(token.color),
                )
                Text(
                    text = token.name,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun TypographyRamp() {
    val scales = listOf(
        "displayLarge" to MaterialTheme.typography.displayLarge,
        "headlineLarge" to MaterialTheme.typography.headlineLarge,
        "titleLarge" to MaterialTheme.typography.titleLarge,
        "bodyLarge" to MaterialTheme.typography.bodyLarge,
        "bodyMedium" to MaterialTheme.typography.bodyMedium,
        "labelMedium" to MaterialTheme.typography.labelMedium,
    )
    Card {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            scales.forEach { (name, style) ->
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(120.dp),
                    )
                    Text(
                        text = "The quick brown fox",
                        style = style,
                    )
                }
            }
        }
    }
}

@Composable
private fun RadiusSamples() {
    val sizes = listOf(
        "sm" to 4.dp,
        "md" to 8.dp,
        "lg" to 12.dp,
        "xl" to 16.dp,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        sizes.forEach { (name, radius) ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(radius))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
                Spacer(Modifier.height(4.dp))
                Text(name, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun SampleComponents(onOpenDialog: () -> Unit) {
    Card {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Card + buttons + input + dialog",
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                text = "Each component reads from MaterialTheme. Token changes propagate without editing this file.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {}) { Text("Primary") }
                OutlinedButton(onClick = {}) { Text("Outlined") }
                Button(
                    onClick = {},
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
                ) { Text("Destructive") }
            }
            var sample by remember { mutableStateOf("") }
            OutlinedTextField(
                value = sample,
                onValueChange = { sample = it },
                label = { Text("Sample input") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(onClick = onOpenDialog) { Text("Open dialog") }
        }
    }
}
