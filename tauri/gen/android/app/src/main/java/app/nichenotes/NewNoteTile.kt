package app.nichenotes

import android.app.PendingIntent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// A Quick Settings tile that opens a new note, like New note on the app's icon.
class NewNoteTile : TileService() {
  // A tile shows as on until told otherwise, and this one has nothing to turn on.
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    val open = NoteWidget.inApp(this, MainActivity.NEW_NOTE)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(open)
    }
  }
}
