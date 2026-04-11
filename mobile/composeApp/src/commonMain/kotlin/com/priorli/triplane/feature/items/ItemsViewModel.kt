package com.priorli.triplane.feature.items

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.priorli.triplane.common.UiState
import com.priorli.triplane.shared.data.remote.api.ApiException
import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.usecase.attachments.UploadAttachmentUseCase
import com.priorli.triplane.shared.domain.usecase.items.CreateItemUseCase
import com.priorli.triplane.shared.domain.usecase.items.DeleteItemUseCase
import com.priorli.triplane.shared.domain.usecase.items.GetItemsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

internal class ItemsViewModel(
    private val getItems: GetItemsUseCase,
    private val createItem: CreateItemUseCase,
    private val deleteItem: DeleteItemUseCase,
    private val uploadAttachment: UploadAttachmentUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<List<Item>>>(UiState.Loading)
    val state: StateFlow<UiState<List<Item>>> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Success(getItems())
            } catch (e: ApiException) {
                _state.value = UiState.Error(e.message)
            } catch (e: Exception) {
                _state.value = UiState.Error(e.message ?: "Failed to load items")
            }
        }
    }

    /**
     * Create an item and, if any photos were picked up front, upload them too.
     * Returns the new item id for the caller to navigate into. Errors during
     * photo upload do not roll back the item — the item is still created and
     * the user can retry uploads from the detail screen.
     */
    suspend fun createWithPhotos(
        title: String,
        description: String?,
        photos: List<PickedPhoto>,
    ): String {
        val created = createItem(title, description)
        for (photo in photos) {
            try {
                uploadAttachment(created.id, photo.fileName, photo.fileType, photo.bytes)
            } catch (_: Exception) {
                // Surface via screen refresh; don't abort remaining uploads.
            }
        }
        refresh()
        return created.id
    }

    suspend fun delete(id: String) {
        deleteItem(id)
        refresh()
    }
}
