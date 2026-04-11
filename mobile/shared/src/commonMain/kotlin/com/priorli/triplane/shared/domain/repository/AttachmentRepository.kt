package com.priorli.triplane.shared.domain.repository

import com.priorli.triplane.shared.domain.model.Attachment

interface AttachmentRepository {
    /**
     * Presign → PUT bytes → save metadata. Returns the persisted Attachment
     * with a fresh presigned GET URL for display.
     */
    suspend fun uploadAttachment(
        itemId: String,
        fileName: String,
        fileType: String,
        bytes: ByteArray,
    ): Attachment

    suspend fun deleteAttachment(id: String)
}
