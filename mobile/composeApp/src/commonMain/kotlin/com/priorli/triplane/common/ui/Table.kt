package com.priorli.triplane.common.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

// Mobile tables are rare and Material 3 has no DataTable. This layer provides
// a convention: `TriplaneTable { Header{...}; Row{...}; Row{...} }` with
// consistent padding, dividers, and typography tied to our design tokens.

@Composable
internal fun TriplaneTable(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth(), content = { content() })
}

@Composable
internal fun TriplaneTableHeaderRow(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) { content() }
    HorizontalDivider()
}

@Composable
internal fun TriplaneTableRow(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) { content() }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
}

@Composable
internal fun TriplaneTableHead(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
internal fun TriplaneTableCell(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
    )
}
