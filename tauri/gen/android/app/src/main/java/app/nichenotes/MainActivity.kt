package app.nichenotes

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
  companion object {
    // The text of the line a widget tap was on, which the note opens at.
    const val LINE = "line"
  }

  // Back goes back through the app's pages, then leaves it.
  override val handleBackNavigation = true

  override fun onCreate(savedInstanceState: Bundle?) {
    withLine(intent)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Android draws the app under its bars and the keyboard, so the page sits between them instead.
    ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { view, insets ->
      val covered = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.updatePadding(covered.left, covered.top, covered.right, covered.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(withLine(intent))
  }

  // Leaving the app refreshes every widget, so it shows what was just written.
  override fun onStop() {
    super.onStop()
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
