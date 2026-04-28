package eu.kanade.tachiyomi.source.builtin

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.Response
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.text.DateFormat
import java.text.ParseException

@PublishedApi
internal val json: Json by lazy { Injekt.get<Json>() }

inline fun <reified T> String.parseAs(): T = json.decodeFromString(serializer(), this)

inline fun <reified T> Response.parseAs(): T = body.string().parseAs<T>()

fun DateFormat.tryParse(date: String?): Long {
    if (date.isNullOrBlank()) return 0L
    return try {
        parse(date)?.time ?: 0L
    } catch (_: ParseException) {
        0L
    }
}
