package app.nichenotes;

import android.app.Activity;
import android.app.ActivityManager;

// Chrome raises the keyboard only on a page someone has touched, which a note just opened from a widget is not.
// Android raises it for any app that comes forward with the cursor in a text. So this covers the note unseen, in a
// task of its own, and once it has the focus it brings the app forward again.
public class RaiseKeyboard extends Activity {
    @Override
    public void onWindowFocusChanged(boolean focused) {
        if (!focused || isFinishing()) return;
        // Posted, since Android hears that this has the focus only after this call returns.
        getWindow().getDecorView().post(() -> {
            for (ActivityManager.AppTask task : getSystemService(ActivityManager.class).getAppTasks()) {
                if (task.getTaskInfo().taskId != getTaskId()) task.moveToFront();
            }
            finishAndRemoveTask();
        });
    }
}
