package com.priorli.triplane.shared.domain.usecase.attachments

import com.priorli.triplane.shared.domain.repository.AttachmentRepository

class DeleteAttachmentUseCase(private val repository: AttachmentRepository) {
    suspend operator fun invoke(id: String) {
        repository.deleteAttachment(id)
    }
}
