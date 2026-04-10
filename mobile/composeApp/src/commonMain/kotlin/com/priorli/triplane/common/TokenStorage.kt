package com.priorli.triplane.common

expect class TokenStorage {
    fun saveToken(token: String)
    fun getToken(): String?
    fun clearToken()
}
