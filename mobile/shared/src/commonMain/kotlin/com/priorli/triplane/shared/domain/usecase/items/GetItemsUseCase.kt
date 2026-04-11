package com.priorli.triplane.shared.domain.usecase.items

import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.repository.ItemRepository

class GetItemsUseCase(private val repository: ItemRepository) {
    suspend operator fun invoke(): List<Item> = repository.listItems()
}
