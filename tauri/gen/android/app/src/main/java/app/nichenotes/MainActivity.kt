package app.nichenotes

import android.Manifest
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : TauriActivity() {
  companion object {
    // The text of the line a widget tap was on, which the note opens at.
    const val LINE = "line"
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
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(withLine(intent))
    raiseKeyboard(intent.data)
  }

  // A note a widget opens wants the keyboard, which the page can't raise without a touch. The app can, once the
  // page shows the note and has put the cursor in it. A running app takes a moment to swap the old page for the note.
  private fun raiseKeyboard(link: Uri?, wait: Long = 400, tries: Int = 50) {
    if (link?.getQueryParameter("n") == null) return
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
    FirebaseMessaging.getInstance().token.addOnSuccessListener { Alerts.register(applicationContext, it) }
    val manager = AppWidgetManager.getInstance(this)
    val widgets = listOf(NoteWidget::class.java, TreeWidget::class.java)
      .flatMap { manager.getAppWidgetIds(ComponentName(this, it)).toList() }
    sendBroadcast(
      Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE, null, this, NoteWidget::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgets.toIntArray())
    )
  }

  private fun withLine(intent: Intent) = intent.apply {
    val line = getStringExtra(LINE) ?: return@apply
    data = data?.buildUpon()?.appendQueryParameter("line", line)?.build()
  }
}
