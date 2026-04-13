package com.priorli.triplane.common.ui

import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

data class TriplaneTab(val key: String, val label: String)

@Composable
internal fun TriplaneTabs(
    tabs: List<TriplaneTab>,
    selectedKey: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val selectedIndex = tabs.indexOfFirst { it.key == selectedKey }.coerceAtLeast(0)
    PrimaryTabRow(
        selectedTabIndex = selectedIndex,
        modifier = modifier,
    ) {
        tabs.forEachIndexed { index, tab ->
            Tab(
                selected = index == selectedIndex,
                onClick = { onSelect(tab.key) },
                text = { Text(tab.label) },
            )
        }
    }
}
