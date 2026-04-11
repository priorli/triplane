package com.priorli.triplane.shared.data.remote.api

import com.priorli.triplane.shared.data.remote.dto.ApiDataWrapper
import com.priorli.triplane.shared.data.remote.dto.AttachmentDataDto
import com.priorli.triplane.shared.data.remote.dto.CreateAttachmentRequestDto
import com.priorli.triplane.shared.data.remote.dto.DeletedResponse
import com.priorli.triplane.shared.data.remote.dto.PresignRequestDto
import com.priorli.triplane.shared.data.remote.dto.PresignResponseDataDto
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess

/**
 * @param apiHttpClient authenticated Triplane API client
 * @param uploadHttpClient bare client for presigned-URL PUTs (no auth header)
 */
class AttachmentApi(
    private val apiHttpClient: HttpClient,
    private val uploadHttpClient: HttpClient,
) {
    suspend fun presign(request: PresignRequestDto): PresignResponseDataDto =
        apiHttpClient.post("/api/v1/attachments/presign") {
            setBody(request)
        }.body<ApiDataWrapper<PresignResponseDataDto>>().data

    /**
     * PUT raw bytes to a presigned URL. Uses the unauthenticated upload client
     * so the Authorization header isn't attached (presigned URLs embed their
     * own auth in the signature).
     */
    suspend fun uploadToPresignedUrl(uploadUrl: String, contentType: String, bytes: ByteArray) {
        val response = uploadHttpClient.put(uploadUrl) {
            contentType(ContentType.parse(contentType))
            setBody(bytes)
        }
        if (!response.status.isSuccess()) {
            throw ApiException(
                errorCode = "UPLOAD_FAILED",
                message = "Presigned PUT failed: HTTP ${response.status.value}",
                httpStatus = response.status.value,
            )
        }
    }

    suspend fun saveAttachmentMetadata(request: CreateAttachmentRequestDto): AttachmentDataDto =
        apiHttpClient.post("/api/v1/attachments") {
            setBody(request)
        }.body<ApiDataWrapper<AttachmentDataDto>>().data

    suspend fun deleteAttachment(id: String): DeletedResponse =
        apiHttpClient.delete("/api/v1/attachments/$id")
            .body<ApiDataWrapper<DeletedResponse>>().data
}
