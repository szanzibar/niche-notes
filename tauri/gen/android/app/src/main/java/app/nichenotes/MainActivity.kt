package app.nichenotes

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File
import java.net.URL
import org.json.JSONObject

class MainActivity : TauriActivity() {
  companion object {
    // The text of the line a widget tap was on, which the note opens at.
    const val LINE = "line"
    const val NEW_NOTE = "/?new"
    private const val UPDATES = "updates"
    private const val OFFERED = "updateOffered"
    private const val OFFERED_VERSION = "updateOfferedVersion"
    private const val DAY_MS = 24 * 60 * 60 * 1000L
  }

  // Back goes back through the app's pages, then leaves it.
  override val handleBackNavigation = true

  private var webView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    withLine(intent)
    raiseKeyboard(intent.data)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Android draws the app under its bars and the keyboard, so the page sits between them instead.
    ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { view, insets ->
      val covered = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.updatePadding(covered.left, covered.top, covered.right, covered.bottom)
      WindowInsetsCompat.CONSUMED
    }
    // Android stops asking once the person has said no twice.
    val alerts = Manifest.permission.POST_NOTIFICATIONS
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(alerts) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(alerts), 0)
    }
    update()
    // A long press on the app's icon offers a new note. Set from here, since a shortcut in the manifest restarts the
    // app on every tap.
    getSystemService(ShortcutManager::class.java).dynamicShortcuts = listOf(
      ShortcutInfo.Builder(this, "new")
        .setShortLabel(getString(R.string.new_note))
        .setIcon(Icon.createWithResource(this, R.drawable.shortcut_new_note))
        .setIntent(NoteWidget.inApp(this, NEW_NOTE))
        .build()
    )
  }

  // Each start looks for a newer release. One an earlier start downloaded waits in a quiet notification, and a tap
  // installs it, so an update never interrupts someone using the app. A dismissed offer comes back a day later, and a
  // newer release is offered at once. With notifications off, none is offered.
  private fun update() {
    val apk = File(cacheDir, "update.apk")
    // Zero when nothing usable was downloaded.
    val ready = if (apk.exists()) packageManager.getPackageArchiveInfo(apk.path, 0)?.longVersionCode ?: 0 else 0
    val have = BuildConfig.VERSION_CODE.toLong()
    // An update that is installed is gone, so a normal start has nothing to read.
    if (ready <= have) apk.delete()
    BuildConfig.RELEASES?.let { releases -> Thread { download(releases, apk, maxOf(ready, have)) }.start() }
    val offered = getPreferences(MODE_PRIVATE)
    val now = System.currentTimeMillis()
    if (ready <= have || ready == offered.getLong(OFFERED_VERSION, 0) && now - offered.getLong(OFFERED, 0) < DAY_MS) return
    offered.edit().putLong(OFFERED, now).putLong(OFFERED_VERSION, ready).apply()
    val install = Intent(Intent.ACTION_VIEW)
      .setDataAndType(
        FileProvider.getUriForFile(this, "$packageName.fileprovider", apk),
        "application/vnd.android.package-archive",
      )
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(UPDATES, getString(R.string.updates), NotificationManager.IMPORTANCE_LOW)
    )
    manager.notify(
      UPDATES,
      0,
      Notification.Builder(this, UPDATES)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(getString(R.string.update_ready))
        .setContentText(getString(R.string.update_install))
        .setAutoCancel(true)
        .setContentIntent(PendingIntent.getActivity(this, 0, install, PendingIntent.FLAG_IMMUTABLE))
        .build(),
    )
  }

  // Offline or a bad reply leaves it to the next start.
  private fun download(releases: String, apk: File, have: Long) = runCatching {
    val release = JSONObject(URL(releases).readText())
    // Tags read android-<versionCode>.
    if (release.getString("tag_name").filter(Char::isDigit).toLong() <= have) return@runCatching
    val part = File(apk.path + ".part")
    val asset = release.getJSONArray("assets").getJSONObject(0).getString("browser_download_url")
    URL(asset).openStream().use { input -> part.outputStream().use { input.copyTo(it) } }
    part.renameTo(apk)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(withLine(intent))
    raiseKeyboard(intent.data)
  }

  // A note a widget or New note opens wants the keyboard, which the page can't raise without a touch. The app can,
  // once the page shows the note and has put the cursor in it. A running app takes a moment to swap the old page for
  // the note.
  private fun raiseKeyboard(link: Uri?, wait: Long = 400, tries: Int = 50) {
    val asks = link?.queryParameterNames ?: return
    if ("n" !in asks && "new" !in asks) return
    window.decorView.postDelayed({
      val view = webView
      view?.requestFocus()
      if (view?.url?.contains("/n/") == true && view.onCheckIsTextEditor()) {
        val keyboard = getSystemService(InputMethodManager::class.java)
        // Android tied the keyboard to the page as it was when the app came forward, before the cursor was in the
        // note, and a keyboard without the note's text corrects nothing and shows no cursor.
        keyboard.restartInput(view)
        keyboard.showSoftInput(view, 0)
        lowerKeyboardOnLeaving(view)
      } else if (tries > 0) {
        raiseKeyboard(link, 100, tries - 1)
      }
    }, wait)
  }

  // The page lowers only a keyboard it raised itself, so the one raised here comes down once nothing on the page
  // takes text, as when Back in the note's header goes to the list.
  private fun lowerKeyboardOnLeaving(view: WebView) {
    view.postDelayed({
      val up = ViewCompat.getRootWindowInsets(view)?.isVisible(WindowInsetsCompat.Type.ime()) == true
      if (up && !view.onCheckIsTextEditor()) {
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(view.windowToken, 0)
      } else if (up) {
        lowerKeyboardOnLeaving(view)
      }
    }, 250)
  }

  // Leaving the app refreshes every widget, so it shows what was just written. It also tells the server where to
  // send alerts, since by then the page has signed in, and the time zone may have changed.
  override fun onStop() {
    super.onStop()
    // The webview writes its cookies to disk only every 30 seconds, so a sign-in just before the app is swiped away
    // would be lost.
    CookieManager.getInstance().flush()
    FirebaseMessaging.getInstance().token.addOnSuccessListener { Alerts.register(applicationContext, it) }
    NoteWidget.refreshAll(this)
  }

  private fun withLine(intent: Intent) = intent.apply {
    val line = getStringExtra(LINE) ?: return@apply
    data = data?.buildUpon()?.appendQueryParameter("line", line)?.build()
  }
}
