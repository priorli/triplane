package com.priorli.triplane.feature.items

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.priorli.triplane.common.UiState
import com.priorli.triplane.feature.items.components.ImagePickerButton
import com.priorli.triplane.feature.items.components.PhotoGallery
import kotlinx.coroutines.launch
import org.koin.compose.viewmodel.koinViewModel
import org.koin.core.parameter.parametersOf

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ItemDetailScreen(
    itemId: String,
    onBack: () -> Unit,
    viewModel: ItemDetailViewModel = koinViewModel(parameters = { parametersOf(itemId) }),
) {
    val state by viewModel.state.collectAsState()
    val uploading by viewModel.uploading.collectAsState()
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Item") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            scope.launch {
                                viewModel.deleteThisItem()
                                onBack()
                            }
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Delete item",
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val s = state) {
                is UiState.Loading -> {
                    Text(
                        text = "Loading…",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is UiState.Error -> {
                    Text(
                        text = s.message,
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                is UiState.Success -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(
                            text = s.data.title,
                            style = MaterialTheme.typography.headlineSmall,
                        )
                        if (!s.data.description.isNullOrBlank()) {
                            Text(
                                text = s.data.description!!,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Photos",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        PhotoGallery(
                            attachments = s.data.attachments,
                            onDelete = { attachment ->
                                scope.launch { viewModel.deletePhoto(attachment.id) }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        ImagePickerButton(
                            label = if (uploading) "Uploading…" else "Add photos",
                            enabled = !uploading,
                            onPicked = { picked -> viewModel.uploadPhotos(picked) },
                        )
                    }
                }
            }
        }
    }
}
