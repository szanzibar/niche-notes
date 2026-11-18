package app.nichenotes

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL
import java.util.TimeZone
import org.json.JSONObject

// The server's alerts come through Firebase, since the app's webview has no Web Push. Each shows on its own, and a
// tap opens the note at its line.
class Alerts : FirebaseMessagingService() {
  override fun onNewToken(token: String) = register(this, token)

  override fun onMessageReceived(message: RemoteMessage) {
    val alert = message.data
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, getString(R.string.alerts), NotificationManager.IMPORTANCE_HIGH)
    )
    val note = Uri.parse(getString(R.string.site)).buildUpon().path("/n/${alert["note"]}")
    alert["text"]?.let { note.appendQueryParameter("line", it) }
    val open = Intent(Intent.ACTION_VIEW, note.build(), this, MainActivity::class.java)
    manager.notify(
      alert["tag"],
      0,
      Notification.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(alert["title"])
        .setContentText(alert["body"])
        .setAutoCancel(true)
        .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE))
        .build(),
    )
  }

  companion object {
    private const val CHANNEL = "alerts"

    // For whoever is signed in to the page, by its cookie. A send that fails waits for the next one.
    fun register(context: Context, token: String) {
      val site = context.getString(R.string.site)
      val cookie = CookieManager.getInstance().getCookie(site) ?: return
      val body = JSONObject()
        .put("subscription", JSONObject().put("fcm", token))
        .put("time_zone", TimeZone.getDefault().id)
      Thread {
        runCatching {
          val http = URL("$site/api/push_subscriptions").openConnection() as HttpURLConnection
          http.requestMethod = "PUT"
          http.doOutput = true
          http.setRequestProperty("Cookie", cookie)
          http.setRequestProperty("Content-Type", "application/json")
          http.outputStream.use { it.write(body.toString().toByteArray()) }
          http.responseCode
          http.disconnect()
        }
      }.start()
    }
  }
}
