package com.priorli.triplane.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.priorli.triplane.feature.auth.AuthScreen
import com.priorli.triplane.feature.auth.rememberIsSignedIn
import com.priorli.triplane.feature.auth.signOut
import com.priorli.triplane.feature.home.HomeScreen
import com.priorli.triplane.feature.items.ItemDetailScreen
import com.priorli.triplane.feature.items.ItemsListScreen
import kotlinx.coroutines.launch

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    val isSignedIn = rememberIsSignedIn()
    val scope = rememberCoroutineScope()

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
                onNavigateToItems = { navController.navigate(ItemsList) },
                onSignOut = { scope.launch { signOut() } },
            )
        }
        composable<ItemsList> {
            ItemsListScreen(
                onItemClick = { itemId -> navController.navigate(ItemDetail(itemId)) },
                onBack = { navController.navigateUp() },
            )
        }
        composable<ItemDetail> { backStackEntry ->
            val route = backStackEntry.toRoute<ItemDetail>()
            ItemDetailScreen(
                itemId = route.itemId,
                onBack = { navController.navigateUp() },
            )
        }
    }
}
