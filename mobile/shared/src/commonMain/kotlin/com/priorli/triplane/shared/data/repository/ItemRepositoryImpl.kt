package com.priorli.triplane.shared.data.repository

import com.priorli.triplane.shared.data.mapper.ItemMapper
import com.priorli.triplane.shared.data.remote.api.ItemApi
import com.priorli.triplane.shared.data.remote.dto.CreateItemRequestDto
import com.priorli.triplane.shared.data.remote.dto.UpdateItemRequestDto
import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.repository.ItemRepository

class ItemRepositoryImpl(
    private val itemApi: ItemApi,
    private val mapper: ItemMapper,
) : ItemRepository {
    override suspend fun listItems(): List<Item> =
        itemApi.listItems().items.map { mapper.toDomain(it) }

    override suspend fun getItem(id: String): Item =
        mapper.toDomain(itemApi.getItem(id).item)

    override suspend fun createItem(title: String, description: String?): Item =
        mapper.toDomain(
            itemApi.createItem(
                CreateItemRequestDto(title = title, description = description),
            ).item,
        )

    override suspend fun updateItem(id: String, title: String?, description: String?): Item =
        mapper.toDomain(
            itemApi.updateItem(
                id = id,
                request = UpdateItemRequestDto(title = title, description = description),
            ).item,
        )

    override suspend fun deleteItem(id: String) {
        itemApi.deleteItem(id)
    }
}
