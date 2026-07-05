import Foundation
import Capacitor

// ─── Data model ────────────────────────────────────────────────────────────────

struct TabDefinition: Identifiable {
    let id: String
    let label: String
    let sfSymbol: String
}

// ─── Plugin ────────────────────────────────────────────────────────────────────

@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin {

    private var host: NativeTabBarHost?

    // MARK: – setup
    @objc func setup(_ call: CAPPluginCall) {
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

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.install(tabs: tabs, activeTab: activeTab, mode: mode, dark: dark)
            call.resolve()
        }
    }

    // MARK: – setActiveTab
    @objc func setActiveTab(_ call: CAPPluginCall) {
        let tab = call.getString("tab") ?? ""
        DispatchQueue.main.async { [weak self] in
            self?.host?.update(activeTab: tab)
            call.resolve()
        }
    }

    // MARK: – setAppearance
    @objc func setAppearance(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "default"
        let dark = call.getBool("dark")   ?? false
        DispatchQueue.main.async { [weak self] in
            self?.host?.update(mode: mode, dark: dark)
            call.resolve()
        }
    }

    // MARK: – show / hide
    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.host?.view.isHidden = false
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.host?.view.isHidden = true
            call.resolve()
        }
    }

    // MARK: – Private install

    private func install(
        tabs: [TabDefinition],
        activeTab: String,
        mode: String,
        dark: Bool
    ) {
        // Tear down any previous overlay
        host?.view.removeFromSuperview()
        host?.removeFromParent()
        host = nil

        guard let parentVC = bridge?.viewController else { return }

        let newHost = NativeTabBarHost(
            tabs:      tabs,
            activeTab: activeTab,
            mode:      mode,
            dark:      dark,
            onSelect:  { [weak self] tabId in
                self?.notifyListeners("tabSelected", data: ["tab": tabId])
            }
        )

        // Add as child so lifecycle propagates correctly
        parentVC.addChild(newHost)
        newHost.view.translatesAutoresizingMaskIntoConstraints = false
        parentVC.view.addSubview(newHost.view)
        newHost.didMove(toParent: parentVC)

        NSLayoutConstraint.activate([
            newHost.view.leadingAnchor.constraint(equalTo: parentVC.view.leadingAnchor),
            newHost.view.trailingAnchor.constraint(equalTo: parentVC.view.trailingAnchor),
            newHost.view.bottomAnchor.constraint(equalTo: parentVC.view.bottomAnchor),
            // Height = safe area + bar height (76 pt) + bottom gap (10 pt)
            newHost.view.topAnchor.constraint(
                equalTo: parentVC.view.safeAreaLayoutGuide.bottomAnchor,
                constant: -(76 + 10)
            ),
        ])

        host = newHost
    }
}
