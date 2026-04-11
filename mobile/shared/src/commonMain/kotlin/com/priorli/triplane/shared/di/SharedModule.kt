package com.priorli.triplane.shared.di

import com.priorli.triplane.shared.data.mapper.ItemMapper
import com.priorli.triplane.shared.data.remote.api.ApiClient
import com.priorli.triplane.shared.data.remote.api.AttachmentApi
import com.priorli.triplane.shared.data.remote.api.ItemApi
import com.priorli.triplane.shared.data.repository.AttachmentRepositoryImpl
import com.priorli.triplane.shared.data.repository.ItemRepositoryImpl
import com.priorli.triplane.shared.domain.repository.AttachmentRepository
import com.priorli.triplane.shared.domain.repository.ItemRepository
import com.priorli.triplane.shared.domain.usecase.attachments.DeleteAttachmentUseCase
import com.priorli.triplane.shared.domain.usecase.attachments.UploadAttachmentUseCase
import com.priorli.triplane.shared.domain.usecase.items.CreateItemUseCase
import com.priorli.triplane.shared.domain.usecase.items.DeleteItemUseCase
import com.priorli.triplane.shared.domain.usecase.items.GetItemUseCase
import com.priorli.triplane.shared.domain.usecase.items.GetItemsUseCase
import com.priorli.triplane.shared.domain.usecase.items.UpdateItemUseCase
import io.ktor.client.HttpClient
import kotlinx.serialization.json.Json
import org.koin.core.module.dsl.factoryOf
import org.koin.core.module.dsl.singleOf
import org.koin.core.qualifier.named
import org.koin.dsl.bind
import org.koin.dsl.module

val sharedModule = module {
    single { ApiClient(get(), get(named("apiBaseUrl"))) }
    single<HttpClient> { get<ApiClient>().httpClient }
    single<HttpClient>(named("uploadHttpClient")) { get<ApiClient>().uploadHttpClient }
    single<Json> { get<ApiClient>().json }

    singleOf(::ItemApi)
    single { AttachmentApi(get(), get(named("uploadHttpClient"))) }

    singleOf(::ItemMapper)

    singleOf(::ItemRepositoryImpl) bind ItemRepository::class
    singleOf(::AttachmentRepositoryImpl) bind AttachmentRepository::class

    factoryOf(::GetItemsUseCase)
    factoryOf(::GetItemUseCase)
    factoryOf(::CreateItemUseCase)
    factoryOf(::UpdateItemUseCase)
    factoryOf(::DeleteItemUseCase)
    factoryOf(::UploadAttachmentUseCase)
    factoryOf(::DeleteAttachmentUseCase)
}
