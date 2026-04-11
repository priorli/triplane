package com.priorli.triplane.shared.data.remote.api

import com.priorli.triplane.shared.data.remote.dto.ApiDataWrapper
import com.priorli.triplane.shared.data.remote.dto.CreateItemRequestDto
import com.priorli.triplane.shared.data.remote.dto.DeletedResponse
import com.priorli.triplane.shared.data.remote.dto.ItemDataDto
import com.priorli.triplane.shared.data.remote.dto.ItemsListDataDto
import com.priorli.triplane.shared.data.remote.dto.UpdateItemRequestDto
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody

class ItemApi(private val httpClient: HttpClient) {
    suspend fun listItems(): ItemsListDataDto =
        httpClient.get("/api/v1/items").body<ApiDataWrapper<ItemsListDataDto>>().data

    suspend fun getItem(id: String): ItemDataDto =
        httpClient.get("/api/v1/items/$id").body<ApiDataWrapper<ItemDataDto>>().data

    suspend fun createItem(request: CreateItemRequestDto): ItemDataDto =
        httpClient.post("/api/v1/items") {
            setBody(request)
        }.body<ApiDataWrapper<ItemDataDto>>().data

    suspend fun updateItem(id: String, request: UpdateItemRequestDto): ItemDataDto =
        httpClient.patch("/api/v1/items/$id") {
            setBody(request)
        }.body<ApiDataWrapper<ItemDataDto>>().data

    suspend fun deleteItem(id: String): DeletedResponse =
        httpClient.delete("/api/v1/items/$id").body<ApiDataWrapper<DeletedResponse>>().data
}
