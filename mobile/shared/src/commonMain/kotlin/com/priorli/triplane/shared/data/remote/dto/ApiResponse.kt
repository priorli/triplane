package com.priorli.triplane.shared.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ApiDataWrapper<T>(val data: T)

@Serializable
data class ApiErrorBody(val code: String, val message: String)

@Serializable
data class ApiErrorWrapper(val error: ApiErrorBody)

@Serializable
data class DeletedResponse(val deleted: Boolean)
