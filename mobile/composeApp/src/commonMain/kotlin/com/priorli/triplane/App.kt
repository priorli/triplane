package com.priorli.triplane

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.priorli.triplane.common.theme.TriplaneTheme
import com.priorli.triplane.feature.splash.SplashOverlay
import com.priorli.triplane.navigation.NavGraph

@Composable
fun App() {
    TriplaneTheme {
        Box(modifier = Modifier.fillMaxSize()) {
            NavGraph()
            SplashOverlay()
        }
    }
}
