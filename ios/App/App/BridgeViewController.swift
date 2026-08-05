import Capacitor
import UIKit

// Local (non-npm) plugins added directly to the app target aren't reliably
// picked up by Capacitor's automatic plugin discovery in this project's setup
// — confirmed empirically (NativeTabBarPlugin conforms to CAPBridgedPlugin,
// same as official npm plugins, yet still resolved as "not implemented" until
// explicitly registered here). Explicit registration bypasses whatever
// discovery gap exists and is guaranteed to work regardless of the cause.
class BridgeViewController: CAPBridgeViewController {
    private var nativeTabShellHost: NativeTabBarHost?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeTabBarPlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(NativeActionMenuPlugin())
    }

    @discardableResult
    func configureNativeTabShell(
        tabs: [TabDefinition],
        activeTab: String,
        mode: String,
        dark: Bool,
        onSelect: @escaping (String) -> Void
    ) -> NativeTabBarHost {
        let host = ensureNativeTabShellHost()
        host.configure(
            tabs: tabs,
            activeTab: activeTab,
            mode: mode,
            dark: dark,
            onSelect: onSelect
        )
        return host
    }

    func updateNativeTabShell(activeTab: String) {
        nativeTabShellHost?.update(activeTab: activeTab)
    }

    func updateNativeTabShell(mode: String, dark: Bool) {
        nativeTabShellHost?.update(mode: mode, dark: dark)
    }

    func setNativeTabShellVisible(_ visible: Bool) {
        nativeTabShellHost?.setVisible(visible)
    }

    private func ensureNativeTabShellHost() -> NativeTabBarHost {
        if let nativeTabShellHost {
            return nativeTabShellHost
        }

        let host = NativeTabBarHost()
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        host.didMove(toParent: self)

        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            // Native shell owns the iOS tab area. The WebView still renders the
            // screen body behind it, matching the floating Apple tab-bar model.
            host.view.topAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -(118 + 18)
            ),
        ])

        nativeTabShellHost = host
        return host
    }
}
