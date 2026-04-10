package com.priorli.triplane.common

import android.content.Context
import android.content.SharedPreferences

actual class TokenStorage(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("triplane_auth", Context.MODE_PRIVATE)

    actual fun saveToken(token: String) {
        prefs.edit().putString("clerk_token", token).apply()
    }

    actual fun getToken(): String? {
        return prefs.getString("clerk_token", null)
    }

    actual fun clearToken() {
        prefs.edit().remove("clerk_token").apply()
    }
}
