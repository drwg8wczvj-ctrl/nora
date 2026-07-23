import Foundation
import Capacitor
import WidgetKit

/// Capacitor plugin that writes widget data to an App Group UserDefaults store
/// and tells WidgetKit to reload all Nora widget timelines immediately.
///
/// Place this file inside the main app target (ios/App/App/).
@objc(NoraWidgetBridgePlugin)
public class NoraWidgetBridgePlugin: CAPPlugin {

    // Must match the App Group configured in Xcode for both the main app
    // target and the widget extension target.
    private let appGroupID = "group.tech.dongar.nora"
    private let storageKey = "nora_widget_data"
    private let pendingActionsKey = "nora_widget_pending_actions"

    @objc func setWidgetData(_ call: CAPPluginCall) {
        guard let data = call.getObject("data") else {
            call.reject("Missing 'data' parameter")
            return
        }

        // Serialize the JS object to a JSON string for storage
        guard
            let jsonData   = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]),
            let jsonString = String(data: jsonData, encoding: .utf8)
        else {
            call.reject("Failed to serialize widget data")
            return
        }

        // Write to the shared container
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            call.reject("App Group '\(appGroupID)' is not configured — check Xcode entitlements")
            return
        }
        defaults.set(jsonString, forKey: storageKey)
        defaults.synchronize()

        // Signal WidgetKit to refresh all timelines immediately
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve(["ok": true])
    }

    /// Drains (reads then clears) any actions queued by interactive widget
    /// buttons — e.g. "Complete Task" tapped without opening the app — so the
    /// JS app can apply them to the real task list. The widget extension is
    /// never the source of truth; this is the one path its optimistic local
    /// updates get reconciled back into it. Call on every app launch/resume.
    @objc func getPendingWidgetActions(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            call.resolve(["actions": []])
            return
        }
        let actions: [[String: Any]]
        if
            let jsonString = defaults.string(forKey: pendingActionsKey),
            let jsonData = jsonString.data(using: .utf8),
            let parsed = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]]
        {
            actions = parsed
        } else {
            actions = []
        }
        defaults.removeObject(forKey: pendingActionsKey)
        call.resolve(["actions": actions])
    }
}
