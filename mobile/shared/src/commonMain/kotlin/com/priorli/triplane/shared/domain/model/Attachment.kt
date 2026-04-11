package com.priorli.triplane.shared.domain.model

import kotlinx.datetime.Instant

data class Attachment(
    val id: String,
    val itemId: String,
    val fileName: String,
    val fileType: String,
    val fileSize: Long,
    val url: String,
    val urlExpiresAt: Instant,
    val createdAt: Instant,
)
