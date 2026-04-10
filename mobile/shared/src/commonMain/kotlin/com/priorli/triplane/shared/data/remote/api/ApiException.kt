package com.priorli.triplane.shared.data.remote.api

/**
 * Thrown when the Triplane API returns an error response.
 * Carries the structured error code and message from { error: { code, message } }.
 */
class ApiException(
    val errorCode: String,
    override val message: String,
    val httpStatus: Int,
) : Exception("[$httpStatus] $errorCode: $message")
