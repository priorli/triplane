package com.priorli.triplane.common

import platform.Foundation.NSUserDefaults

actual class TokenStorage {
    private val defaults = NSUserDefaults.standardUserDefaults

    actual fun saveToken(token: String) {
        defaults.setObject(token, forKey = "clerk_token")
    }

    actual fun getToken(): String? {
        return defaults.stringForKey("clerk_token")
    }

    actual fun clearToken() {
        defaults.removeObjectForKey("clerk_token")
    }
}
