package com.priorli.triplane.navigation

import kotlinx.serialization.Serializable

@Serializable
object Auth

@Serializable
object Home

@Serializable
object ItemsList

@Serializable
data class ItemDetail(val itemId: String)
