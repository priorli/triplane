package com.priorli.triplane.shared.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ItemDto(
    val id: String,
    val userId: String,
    val title: String,
    val description: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val attachments: List<AttachmentDto> = emptyList(),
)

@Serializable
data class ItemsListDataDto(val items: List<ItemDto>)

@Serializable
data class ItemDataDto(val item: ItemDto)

@Serializable
data class CreateItemRequestDto(
    val title: String,
    val description: String? = null,
)

@Serializable
data class UpdateItemRequestDto(
    val title: String? = null,
    val description: String? = null,
)
