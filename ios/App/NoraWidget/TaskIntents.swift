import AppIntents
import WidgetKit

// Interactive "Complete Task" button (iOS 17+ widget App Intents) — the one
// real in-widget action for this pass (see Part 10 of the redesign brief).
// Runs inside the widget extension process itself, so it can't touch the
// main app's real task list directly; it optimistically updates the cached
// snapshot for instant visual feedback, then queues a pending action for the
// JS app to apply authoritatively next time it's foregrounded (see
// src/lib/noraWidgetBridge.js's applyPendingWidgetActions).
struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Task"
    static var description = IntentDescription("Marks a Nora task as complete from the widget.")

    @Parameter(title: "Task ID")
    var taskId: String

    init() {}
    init(taskId: String) {
        self.taskId = taskId
    }

    func perform() async throws -> some IntentResult {
        WidgetStore.markTaskCompletedLocally(taskId: taskId)
        WidgetStore.enqueuePendingAction(type: "complete_task", taskId: taskId)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
