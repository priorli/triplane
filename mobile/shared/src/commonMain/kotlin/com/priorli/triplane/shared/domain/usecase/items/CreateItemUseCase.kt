package com.priorli.triplane.shared.domain.usecase.items

import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.repository.ItemRepository

class CreateItemUseCase(private val repository: ItemRepository) {
    suspend operator fun invoke(title: String, description: String? = null): Item =
        repository.createItem(title, description)
}
