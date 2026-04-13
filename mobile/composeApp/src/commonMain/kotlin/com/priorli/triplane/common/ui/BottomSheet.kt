package com.priorli.triplane.common.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

// Web calls this `Sheet`; on mobile `BottomSheet` is the more common idiom
// (side drawers are rare outside of nav). When Phase E's /design-study flags a
// side-anchored pattern, add a variant here that wraps a nav Drawer.

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TriplaneBottomSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    skipPartiallyExpanded: Boolean = false,
    content: @Composable () -> Unit,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = skipPartiallyExpanded)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        modifier = modifier,
    ) {
        content()
    }
}
