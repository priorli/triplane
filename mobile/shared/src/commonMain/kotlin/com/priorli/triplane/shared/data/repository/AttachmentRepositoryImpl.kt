package com.priorli.triplane.shared.data.repository

import com.priorli.triplane.shared.data.mapper.ItemMapper
import com.priorli.triplane.shared.data.remote.api.AttachmentApi
import com.priorli.triplane.shared.data.remote.dto.CreateAttachmentRequestDto
import com.priorli.triplane.shared.data.remote.dto.PresignRequestDto
import com.priorli.triplane.shared.domain.model.Attachment
import com.priorli.triplane.shared.domain.repository.AttachmentRepository

class AttachmentRepositoryImpl(
    private val attachmentApi: AttachmentApi,
    private val mapper: ItemMapper,
) : AttachmentRepository {
    override suspend fun uploadAttachment(
        itemId: String,
        fileName: String,
        fileType: String,
        bytes: ByteArray,
    ): Attachment {
        // 1. Get presigned PUT URL
        val presign = attachmentApi.presign(
            PresignRequestDto(
                fileName = fileName,
                fileType = fileType,
                fileSize = bytes.size.toLong(),
            ),
        )

        // 2. PUT bytes directly to Tigris
        attachmentApi.uploadToPresignedUrl(
            uploadUrl = presign.uploadUrl,
            contentType = fileType,
            bytes = bytes,
        )

        // 3. Save metadata row
        val dto = attachmentApi.saveAttachmentMetadata(
            CreateAttachmentRequestDto(
                itemId = itemId,
                storageKey = presign.storageKey,
                fileName = fileName,
                fileType = fileType,
                fileSize = bytes.size.toLong(),
            ),
        ).attachment

        return mapper.toDomain(dto)
    }

    override suspend fun deleteAttachment(id: String) {
        attachmentApi.deleteAttachment(id)
    }
}
