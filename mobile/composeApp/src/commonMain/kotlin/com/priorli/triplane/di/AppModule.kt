package com.priorli.triplane.di

import com.priorli.triplane.feature.items.ItemDetailViewModel
import com.priorli.triplane.feature.items.ItemsViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

val appModule = module {
    viewModelOf(::ItemsViewModel)
    viewModel { (itemId: String) ->
        ItemDetailViewModel(
            itemId = itemId,
            getItem = get(),
            deleteItem = get(),
            uploadAttachment = get(),
            deleteAttachment = get(),
        )
    }
}
