package com.priorli.triplane.shared.domain.usecase.items

import com.priorli.triplane.shared.domain.repository.ItemRepository

class DeleteItemUseCase(private val repository: ItemRepository) {
    suspend operator fun invoke(id: String) {
        repository.deleteItem(id)
    }
}
