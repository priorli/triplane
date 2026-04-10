package com.priorli.triplane

import androidx.compose.runtime.Composable
import com.priorli.triplane.navigation.NavGraph
import com.priorli.triplane.common.theme.TriplaneTheme

@Composable
fun App() {
    TriplaneTheme {
        NavGraph()
    }
}
