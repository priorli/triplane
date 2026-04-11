package com.priorli.triplane.shared.data.mapper

import com.priorli.triplane.shared.data.remote.dto.AttachmentDto
import com.priorli.triplane.shared.data.remote.dto.ItemDto
import com.priorli.triplane.shared.domain.model.Attachment
import com.priorli.triplane.shared.domain.model.Item
import kotlinx.datetime.Instant

/**
 * DTO ↔ domain translation for items and attachments.
 *
 * Registered as a singleton in SharedModule so feature code can depend on an
 * interface-like instance. The class is stateless; Koin's singleton scope is
 * just a convenience.
 *
 * Note: never use `String.format` or JVM-only stdlib here — this file has to
 * compile for iOS. Use `Instant.parse` for timestamps.
 */
class ItemMapper {
    fun toDomain(dto: ItemDto): Item = Item(
        id = dto.id,
        userId = dto.userId,
        title = dto.title,
        description = dto.description,
        createdAt = Instant.parse(dto.createdAt),
        updatedAt = Instant.parse(dto.updatedAt),
        attachments = dto.attachments.map { toDomain(it) },
    )

    fun toDomain(dto: AttachmentDto): Attachment = Attachment(
        id = dto.id,
        itemId = dto.itemId,
        fileName = dto.fileName,
        fileType = dto.fileType,
        fileSize = dto.fileSize,
        url = dto.url,
        urlExpiresAt = Instant.parse(dto.urlExpiresAt),
        createdAt = Instant.parse(dto.createdAt),
    )
}
