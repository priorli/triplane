package com.priorli.triplane.shared.domain.usecase.items

import com.priorli.triplane.shared.domain.model.Item
import com.priorli.triplane.shared.domain.repository.ItemRepository

class GetItemUseCase(private val repository: ItemRepository) {
    suspend operator fun invoke(id: String): Item = repository.getItem(id)
}
