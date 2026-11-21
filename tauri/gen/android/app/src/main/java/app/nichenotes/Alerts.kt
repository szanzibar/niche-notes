package app.nichenotes

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.TimeZone
import org.json.JSONObject

// The server's alerts come through Firebase, since the app's webview has no Web Push. Each shows on its own, and a
// tap opens the note at its line. A note changed elsewhere comes through here too, for the widgets.
class Alerts : FirebaseMessagingService() {
  override fun onNewToken(token: String) = register(this, token)

  override fun onMessageReceived(message: RemoteMessage) {
    val alert = message.data
    if (alert.containsKey("widgets")) return NoteWidget.refreshAll(this)
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, getString(R.string.alerts), NotificationManager.IMPORTANCE_HIGH)
    )
    val note = Uri.parse(getString(R.string.site)).buildUpon().path("/n/${alert["note"]}")
    alert["text"]?.let { note.appendQueryParameter("line", it) }
    val open = Intent(Intent.ACTION_VIEW, note.build(), this, MainActivity::class.java)
    val notification = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(alert["title"])
      .setContentText(alert["body"])
      .setAutoCancel(true)
      .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE))
    // A dated line's alert, not a shared note's.
    if (alert["due"] != null) {
      val extras = Bundle().apply { alert.forEach { (key, value) -> putString(key, value) } }
      for ((action, title) in listOf(DONE to R.string.done, SNOOZE to R.string.snooze)) {
        val change = Intent(action, note.build(), this, AlertAction::class.java).putExtras(extras)
        val pending =
          PendingIntent.getBroadcast(this, 0, change, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        notification.addAction(Notification.Action.Builder(null, getString(title), pending).build())
      }
    }
    manager.notify(alert["tag"], 0, notification.build())
  }

  companion object {
    private const val CHANNEL = "alerts"
    const val DONE = "app.nichenotes.DONE"
    const val SNOOZE = "app.nichenotes.SNOOZE"

    fun register(context: Context, token: String) {
      val body = JSONObject()
        .put("subscription", JSONObject().put("fcm", token))
        .put("time_zone", TimeZone.getDefault().id)
      Thread { send(context, "PUT", "/api/push_subscriptions", body) }.start()
    }

    // As whoever is signed in to the page, by its cookie. Zero when the server couldn't be reached.
    fun send(context: Context, method: String, path: String, body: JSONObject): Int {
      val site = context.getString(R.string.site)
      val cookie = CookieManager.getInstance().getCookie(site) ?: return 0
      return runCatching {
        val http = URL(site + path).openConnection() as HttpURLConnection
        http.requestMethod = method
        http.doOutput = true
        http.setRequestProperty("Cookie", cookie)
        http.setRequestProperty("Content-Type", "application/json")
        http.outputStream.use { it.write(body.toString().toByteArray()) }
        http.responseCode.also { http.disconnect() }
      }.getOrDefault(0)
    }
  }
}

// Done ticks the alert's line, or moves a repeating one to the next date the server sent, and Snooze moves it to an
// hour from now. A Due widget's box is Done too. The server makes the change, since the app may be closed, and the
// alert goes away and the widgets redraw once it has, or once it answers 404 because the line was already ticked or
// edited. Otherwise the alert stays, and its tap opens the note.
class AlertAction : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alert = intent.extras!!
    val change = JSONObject().put("due", alert.getString("due")).put("text", alert.getString("text"))
    val to =
      if (intent.action == Alerts.SNOOZE) {
        LocalDateTime.now().plusHours(1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"))
      } else {
        alert.getString("next")
      }
    if (to != null) change.put("move_to", to) else change.put("checked", true)
    val finished = goAsync()
    Thread {
      val status = Alerts.send(context, "PATCH", "/api/docs/${alert.getString("note")}/line", change)
      if (status in 200..299 || status == 404) {
        alert.getString("tag")?.let { context.getSystemService(NotificationManager::class.java).cancel(it, 0) }
        NoteWidget.refreshAll(context)
      }
      finished.finish()
    }.start()
  }
}
