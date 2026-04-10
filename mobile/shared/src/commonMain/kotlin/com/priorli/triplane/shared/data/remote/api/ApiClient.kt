package com.priorli.triplane.shared.data.remote.api

import com.priorli.triplane.shared.data.auth.AuthTokenProvider
import com.priorli.triplane.shared.data.remote.dto.ApiErrorWrapper
import io.ktor.client.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json

class ApiClient(
    private val authTokenProvider: AuthTokenProvider,
    private val baseUrl: String = "http://10.0.2.2:3000",
) {
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = false
    }

    val httpClient = HttpClient {
        install(ContentNegotiation) {
            json(this@ApiClient.json)
        }

        install(Logging) {
            logger = object : Logger {
                override fun log(message: String) {
                    // Uses println for multiplatform compatibility
                    // On Android this shows in Logcat, on iOS in Xcode console
                    println("[TriplaneAPI] $message")
                }
            }
            level = LogLevel.HEADERS
            sanitizeHeader { header -> header == HttpHeaders.Authorization }
        }

        defaultRequest {
            url(baseUrl)
            contentType(ContentType.Application.Json)
            val token = runBlocking { authTokenProvider.getToken() }
            if (token != null) {
                header(HttpHeaders.Authorization, "Bearer $token")
            }
        }

        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 10_000
        }

        // Check response status and throw ApiException for errors
        HttpResponseValidator {
            validateResponse { response ->
                if (!response.status.isSuccess()) {
                    val bodyText = response.bodyAsText()
                    val apiError = try {
                        json.decodeFromString<ApiErrorWrapper>(bodyText)
                    } catch (_: Exception) {
                        null
                    }
                    val code = apiError?.error?.code ?: "HTTP_${response.status.value}"
                    val message = apiError?.error?.message ?: "Request failed: ${response.status}"

                    println("[TriplaneAPI] ERROR ${response.status.value} ${response.request.url}: $code — $message")

                    throw ApiException(
                        errorCode = code,
                        message = message,
                        httpStatus = response.status.value,
                    )
                }
            }
        }
    }
}
