package com.priorli.triplane.shared.domain.usecase.attachments

import com.priorli.triplane.shared.domain.model.Attachment
import com.priorli.triplane.shared.domain.repository.AttachmentRepository

class UploadAttachmentUseCase(private val repository: AttachmentRepository) {
    suspend operator fun invoke(
        itemId: String,
        fileName: String,
        fileType: String,
        bytes: ByteArray,
    ): Attachment = repository.uploadAttachment(itemId, fileName, fileType, bytes)
}
