package com.priorli.triplane.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.priorli.triplane.feature.auth.AuthScreen
import com.priorli.triplane.feature.auth.rememberIsSignedIn
import com.priorli.triplane.feature.auth.signOut
import com.priorli.triplane.feature.home.HomeScreen
import kotlinx.coroutines.launch

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    val isSignedIn = rememberIsSignedIn()
    val scope = rememberCoroutineScope()

    // React to sign-in state changes (e.g., after sign-out from elsewhere)
    LaunchedEffect(isSignedIn) {
        val currentRoute = navController.currentDestination?.route
        if (!isSignedIn && currentRoute != null && !currentRoute.contains("Auth")) {
            navController.navigate(Auth) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = if (isSignedIn) Home else Auth,
    ) {
        composable<Auth> {
            AuthScreen(
                onAuthenticated = {
                    navController.navigate(Home) {
                        popUpTo(Auth) { inclusive = true }
                    }
                },
            )
        }
        composable<Home> {
            HomeScreen(
                onSignOut = {
                    scope.launch { signOut() }
                },
            )
        }
        // Add new routes here as features are added.
    }
}
