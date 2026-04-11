package com.priorli.triplane.shared.domain.usecase.items

import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.repository.ItemRepository

class UpdateItemUseCase(private val repository: ItemRepository) {
    suspend operator fun invoke(
        id: String,
        title: String? = null,
        description: String? = null,
    ): Item = repository.updateItem(id, title, description)
}
