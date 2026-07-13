import Foundation
import Capacitor

// ─── Data model ────────────────────────────────────────────────────────────────

struct TabDefinition: Identifiable {
    let id: String
    let label: String
    let sfSymbol: String
}

// ─── Plugin ────────────────────────────────────────────────────────────────────

// Registers directly via CAPBridgedPlugin (the modern Capacitor 7+ pattern for
// SPM-based projects) rather than the legacy Objective-C CAP_PLUGIN macro,
// which does not reliably auto-register Swift plugin classes in this setup —
// confirmed by comparing against @capacitor/local-notifications's own
// LocalNotificationsPlugin.swift, which uses this exact same pattern.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setup",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveTab",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide",          returnType: CAPPluginReturnPromise),
    ]

    private weak var host: NativeTabBarHost?

    // MARK: – setup
    @objc func setup(_ call: CAPPluginCall) {
        // Real Liquid Glass (glassEffect) is iOS 26+. On older OS fall back to the
        // web CSS tab bar, which uses backdrop-filter and looks better than any
        // UIKit material fallback we could build.
        guard #available(iOS 26, *) else {
            call.reject("nativeGlassUnavailable")
            return
        }
        guard let tabsRaw = call.getArray("tabs") as? [[String: Any]] else {
            call.reject("tabs required")
            return
        }
        let tabs: [TabDefinition] = tabsRaw.compactMap {
            guard let id       = $0["id"]       as? String,
                  let label    = $0["label"]     as? String,
                  let symbol   = $0["sfSymbol"]  as? String
            else { return nil }
            return TabDefinition(id: id, label: label, sfSymbol: symbol)
        }
        let activeTab = call.getString("activeTab") ?? (tabs.first?.id ?? "")
        let mode      = call.getString("mode")      ?? "default"
        let dark      = call.getBool("dark")        ?? false
        let visible   = call.getBool("visible")     ?? true

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let shellVC = self.bridge?.viewController as? BridgeViewController else {
                call.reject("nativeShellUnavailable")
                return
            }
            self.host = shellVC.configureNativeTabShell(
                tabs: tabs,
                activeTab: activeTab,
                mode: mode,
                dark: dark,
                onSelect: { [weak self] tabId in
                    self?.notifyListeners("tabSelected", data: ["tab": tabId])
                }
            )
            shellVC.setNativeTabShellVisible(visible)
            call.resolve()
        }
    }

    // MARK: – setActiveTab
    @objc func setActiveTab(_ call: CAPPluginCall) {
        let tab = call.getString("tab") ?? ""
        DispatchQueue.main.async { [weak self] in
            if let shellVC = self?.bridge?.viewController as? BridgeViewController {
                shellVC.updateNativeTabShell(activeTab: tab)
            } else {
                self?.host?.update(activeTab: tab)
            }
            call.resolve()
        }
    }

    // MARK: – setAppearance
    @objc func setAppearance(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "default"
        let dark = call.getBool("dark")   ?? false
        DispatchQueue.main.async { [weak self] in
            if let shellVC = self?.bridge?.viewController as? BridgeViewController {
                shellVC.updateNativeTabShell(mode: mode, dark: dark)
            } else {
                self?.host?.update(mode: mode, dark: dark)
            }
            call.resolve()
        }
    }

    // MARK: – show / hide
    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let shellVC = self?.bridge?.viewController as? BridgeViewController {
                shellVC.setNativeTabShellVisible(true)
            } else {
                self?.host?.setVisible(true)
            }
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let shellVC = self?.bridge?.viewController as? BridgeViewController {
                shellVC.setNativeTabShellVisible(false)
            } else {
                self?.host?.setVisible(false)
            }
            call.resolve()
        }
    }
}
