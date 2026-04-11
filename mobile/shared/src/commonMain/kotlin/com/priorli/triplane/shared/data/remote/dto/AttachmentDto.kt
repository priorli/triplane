package com.priorli.triplane.shared.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class AttachmentDto(
    val id: String,
    val itemId: String,
    val fileName: String,
    val fileType: String,
    val fileSize: Long,
    val url: String,
    val urlExpiresAt: String,
    val createdAt: String,
)

@Serializable
data class AttachmentDataDto(val attachment: AttachmentDto)

@Serializable
data class PresignRequestDto(
    val fileName: String,
    val fileType: String,
    val fileSize: Long,
)

@Serializable
data class PresignResponseDataDto(
    val uploadUrl: String,
    val storageKey: String,
    val expiresIn: Int,
)

@Serializable
data class CreateAttachmentRequestDto(
    val itemId: String,
    val storageKey: String,
    val fileName: String,
    val fileType: String,
    val fileSize: Long,
)
