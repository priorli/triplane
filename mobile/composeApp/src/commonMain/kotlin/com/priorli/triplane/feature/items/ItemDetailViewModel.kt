package com.priorli.triplane.feature.items

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.priorli.triplane.common.UiState
import com.priorli.triplane.shared.data.remote.api.ApiException
import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.usecase.attachments.DeleteAttachmentUseCase
import com.priorli.triplane.shared.domain.usecase.attachments.UploadAttachmentUseCase
import com.priorli.triplane.shared.domain.usecase.items.DeleteItemUseCase
import com.priorli.triplane.shared.domain.usecase.items.GetItemUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

internal class ItemDetailViewModel(
    private val itemId: String,
    private val getItem: GetItemUseCase,
    private val deleteItem: DeleteItemUseCase,
    private val uploadAttachment: UploadAttachmentUseCase,
    private val deleteAttachment: DeleteAttachmentUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<Item>>(UiState.Loading)
    val state: StateFlow<UiState<Item>> = _state.asStateFlow()

    private val _uploading = MutableStateFlow(false)
    val uploading: StateFlow<Boolean> = _uploading.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Success(getItem(itemId))
            } catch (e: ApiException) {
                _state.value = UiState.Error(e.message)
            } catch (e: Exception) {
                _state.value = UiState.Error(e.message ?: "Failed to load item")
            }
        }
    }

    fun uploadPhotos(photos: List<PickedPhoto>) {
        if (photos.isEmpty()) return
        viewModelScope.launch {
            _uploading.value = true
            try {
                for (photo in photos) {
                    uploadAttachment(
                        itemId = itemId,
                        fileName = photo.fileName,
                        fileType = photo.fileType,
                        bytes = photo.bytes,
                    )
                }
                refresh()
            } finally {
                _uploading.value = false
            }
        }
    }

    suspend fun deleteThisItem() {
        deleteItem(itemId)
    }

    suspend fun deletePhoto(attachmentId: String) {
        deleteAttachment(attachmentId)
        refresh()
    }
}

/**
 * A picked image: raw bytes plus a guessed filename and MIME type. The web API
 * whitelist is image/jpeg, image/png, image/webp — ImagePickerButton defaults
 * to image/jpeg when the platform picker does not report a MIME type.
 */
internal data class PickedPhoto(
    val fileName: String,
    val fileType: String,
    val bytes: ByteArray,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PickedPhoto) return false
        return fileName == other.fileName && fileType == other.fileType && bytes.contentEquals(other.bytes)
    }

    override fun hashCode(): Int {
        var result = fileName.hashCode()
        result = 31 * result + fileType.hashCode()
        result = 31 * result + bytes.contentHashCode()
        return result
    }
}
