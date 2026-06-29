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
}
