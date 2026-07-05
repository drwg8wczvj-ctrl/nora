import UIKit
import SwiftUI

// ─── UIViewController host ─────────────────────────────────────────────────────

final class NativeTabBarHost: UIViewController {

    private var hc: UIHostingController<NativeTabBarContent>!
    private let onSelect: (String) -> Void

    init(
        tabs: [TabDefinition],
        activeTab: String,
        mode: String,
        dark: Bool,
        onSelect: @escaping (String) -> Void
    ) {
        self.onSelect = onSelect
        super.init(nibName: nil, bundle: nil)

        let content = NativeTabBarContent(
            tabs: tabs,
            activeTab: activeTab,
            mode: mode,
            dark: dark,
            onSelect: onSelect
        )
        hc = UIHostingController(rootView: content)
        hc.view.backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true

        addChild(hc)
        hc.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hc.view)
        hc.didMove(toParent: self)

        NSLayoutConstraint.activate([
            hc.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hc.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hc.view.topAnchor.constraint(equalTo: view.topAnchor),
            hc.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    // Called by the plugin to sync React state → native UI
    func update(activeTab: String) {
        hc.rootView.activeTab = activeTab
    }
    func update(mode: String, dark: Bool) {
        hc.rootView.mode   = mode
        hc.rootView.dark   = dark
    }
}

// ─── SwiftUI content ───────────────────────────────────────────────────────────

struct NativeTabBarContent: View {
    let tabs: [TabDefinition]
    var activeTab: String
    var mode: String
    var dark: Bool
    let onSelect: (String) -> Void

    @Namespace private var indicatorNS

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            if mode == "glass" {
                glassBar
            } else {
                defaultBar
            }
        }
    }

    // ── iOS 26 Liquid Glass bar ────────────────────────────────────────────────

    private var glassBar: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { tab in
                glassTabItem(tab)
            }
        }
        .frame(height: 60)
        .padding(8)
        .background { glassContainer }
        .padding(.horizontal, 14)
        .padding(.bottom, safeBottom + 2)
        .animation(.spring(response: 0.40, dampingFraction: 0.72), value: activeTab)
    }

    @ViewBuilder
    private var glassContainer: some View {
        if #available(iOS 26, *) {
            // Real Liquid Glass — the OS compositor renders refraction,
            // specular highlights, and vibrancy. We set shape; iOS does the rest.
            Capsule()
                .glassEffect()
        } else {
            // iOS 17–25 graceful fallback: system material blur
            Capsule()
                .fill(.regularMaterial)
                .overlay(
                    Capsule()
                        .stroke(Color.white.opacity(0.22), lineWidth: 0.5)
                )
                .shadow(color: .black.opacity(0.24), radius: 18, y: 8)
        }
    }

    private func glassTabItem(_ tab: TabDefinition) -> some View {
        let isActive = tab.id == activeTab
        return ZStack {
            // Selection indicator: brighter glass capsule inside the bar
            if isActive {
                Capsule()
                    .fill(.white.opacity(0.16))
                    .overlay(
                        Capsule().stroke(Color.white.opacity(0.30), lineWidth: 0.5)
                    )
                    .matchedGeometryEffect(id: "sel", in: indicatorNS)
                    .padding(2)
            }

            // Icon + label
            Button { onSelect(tab.id) } label: {
                VStack(spacing: 3) {
                    Image(systemName: tab.sfSymbol)
                        .font(.system(size: 21, weight: .medium))
                        .symbolEffect(.bounce, value: isActive)
                    Text(tab.label)
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .foregroundStyle(isActive ? .white : Color.white.opacity(0.50))
            }
            .buttonStyle(.plain)
        }
    }

    // ── Default (non-glass) bar ────────────────────────────────────────────────

    private var defaultBar: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { tab in
                defaultTabItem(tab)
            }
        }
        .frame(height: 49)
        .background(Color(uiColor: .systemBackground))
        .overlay(alignment: .top) {
            Color(uiColor: .separator).frame(height: 0.5)
        }
        .padding(.bottom, safeBottom)
    }

    private func defaultTabItem(_ tab: TabDefinition) -> some View {
        let isActive = tab.id == activeTab
        return Button { onSelect(tab.id) } label: {
            VStack(spacing: 3) {
                Image(systemName: tab.sfSymbol)
                    .font(.system(size: 22, weight: tab.id == activeTab ? .semibold : .regular))
                Text(tab.label)
                    .font(.system(size: 10, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .foregroundStyle(isActive
                ? Color.accentColor
                : Color(uiColor: .secondaryLabel))
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private var safeBottom: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows
            .first(where: \.isKeyWindow)?
            .safeAreaInsets.bottom ?? 0
    }
}
