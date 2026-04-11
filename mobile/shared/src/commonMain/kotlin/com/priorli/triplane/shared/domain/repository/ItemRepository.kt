package com.priorli.triplane.shared.domain.repository

import com.priorli.triplane.shared.domain.model.Item

interface ItemRepository {
    suspend fun listItems(): List<Item>
    suspend fun getItem(id: String): Item
    suspend fun createItem(title: String, description: String?): Item
    suspend fun updateItem(id: String, title: String?, description: String?): Item
    suspend fun deleteItem(id: String)
}
