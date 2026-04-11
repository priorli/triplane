package com.priorli.triplane.shared.domain.model

import kotlinx.datetime.Instant

data class Item(
    val id: String,
    val userId: String,
    val title: String,
    val description: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val attachments: List<Attachment>,
)
