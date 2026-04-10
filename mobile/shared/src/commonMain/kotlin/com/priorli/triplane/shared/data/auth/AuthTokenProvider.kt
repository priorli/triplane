package com.priorli.triplane.shared.data.auth

interface AuthTokenProvider {
    suspend fun getToken(): String?
}
