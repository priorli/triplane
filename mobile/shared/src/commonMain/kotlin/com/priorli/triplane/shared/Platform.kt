package com.priorli.triplane.shared

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform
