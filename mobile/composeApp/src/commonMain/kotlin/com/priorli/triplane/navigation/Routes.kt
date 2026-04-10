package com.priorli.triplane.navigation

import kotlinx.serialization.Serializable

/**
 * Type-safe nav routes. Add new @Serializable classes here as you add features,
 * and register them in NavGraph.kt.
 *
 * Convention:
 *   - `object` for parameter-less destinations
 *   - `data class` with @Serializable fields for destinations that take args
 */

@Serializable
object Auth

@Serializable
object Home
