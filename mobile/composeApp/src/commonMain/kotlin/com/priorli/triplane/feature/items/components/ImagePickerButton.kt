package com.priorli.triplane.feature.items.components

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import com.preat.peekaboo.image.picker.SelectionMode
import com.preat.peekaboo.image.picker.rememberImagePickerLauncher
import com.priorli.triplane.feature.items.PickedPhoto

/**
 * Wraps Peekaboo's `rememberImagePickerLauncher`. Peekaboo returns raw
 * `ByteArray` and does not surface the filename or MIME type, so we synthesize
 * a filename and default the MIME to image/jpeg (which matches the API
 * whitelist and what device cameras produce by default). The server will
 * re-validate on presign.
 */
@Composable
internal fun ImagePickerButton(
    label: String,
    enabled: Boolean = true,
    maxSelection: Int = 10,
    onPicked: (List<PickedPhoto>) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val launcher = rememberImagePickerLauncher(
        selectionMode = SelectionMode.Multiple(maxSelection = maxSelection),
        scope = scope,
        onResult = { byteArrays ->
            val picked = byteArrays.mapIndexed { index, bytes ->
                PickedPhoto(
                    fileName = "photo-${index + 1}.jpg",
                    fileType = "image/jpeg",
                    bytes = bytes,
                )
            }
            onPicked(picked)
        },
    )

    Button(onClick = { launcher.launch() }, enabled = enabled) {
        Text(label)
    }
}
