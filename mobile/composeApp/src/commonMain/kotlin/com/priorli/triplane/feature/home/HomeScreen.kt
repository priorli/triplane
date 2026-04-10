package com.priorli.triplane.feature.home

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Placeholder authenticated home screen. Triplane v0.1 ships this as a starting
 * point — replace it with your real app's home screen when you start building.
 *
 * Phase 4 (items + photos) will replace this with `ItemsListScreen`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onSignOut: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Triplane") },
                actions = {
                    IconButton(onClick = onSignOut) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Welcome to Triplane",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Priorli's full-stack monorepo template — three surfaces, one codebase.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Add your first feature",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Use the /feature skill to draft a spec, scaffold the API and screens, and register the feature in PLAN.md.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
