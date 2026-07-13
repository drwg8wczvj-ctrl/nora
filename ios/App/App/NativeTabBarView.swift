import UIKit

private final class NativeTabContentViewController: UIViewController {
    override func loadView() {
        let root = UIView()
        root.backgroundColor = .clear
        root.isOpaque = false
        view = root
    }
}

private final class NativeTabContainerView: UIView {
    var interactiveFrame: CGRect = .null {
        didSet { updateMask() }
    }

    override var bounds: CGRect {
        didSet { updateMask() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard !interactiveFrame.isNull else {
            return super.point(inside: point, with: event)
        }

        return interactiveFrame.insetBy(dx: -12, dy: -14).contains(point)
    }

    private func updateMask() {
        guard bounds.width > 0, bounds.height > 0, !interactiveFrame.isNull else {
            layer.mask = nil
            return
        }

        let visibleRect = interactiveFrame
            .insetBy(dx: -26, dy: -34)
            .intersection(bounds)

        guard !visibleRect.isNull, visibleRect.width > 0, visibleRect.height > 0 else {
            layer.mask = nil
            return
        }

        let mask = CAShapeLayer()
        mask.frame = bounds
        mask.path = UIBezierPath(
            roundedRect: visibleRect,
            cornerRadius: visibleRect.height / 2
        ).cgPath
        layer.mask = mask
    }
}

// UITabBar's height is computed by the system via sizeThatFits(_:) and isn't
// exposed as a directly-settable property on UITabBarController. Padding the
// result here — before the controller ever asks for a size — grows the real
// system bar (and its automatic Liquid Glass rendering) instead of drawing a
// second, disconnected shape on top of it.
//
// iOS 26's floating tab bar pins the label to a fixed offset from the bar's
// bottom edge and the icon to a fixed offset from its top — confirmed by
// testing titlePositionAdjustment and imageInsets, both fully ignored by this
// rendering path. So any extra height here goes straight into the icon/label
// gap with no way to compensate; kept small so that growth stays unnoticeable.
private final class TallGlassTabBar: UITabBar {
    override func sizeThatFits(_ size: CGSize) -> CGSize {
        var fitted = super.sizeThatFits(size)
        fitted.height += 2
        return fitted
    }
}

final class NativeTabBarHost: UIViewController, UITabBarControllerDelegate, UIGestureRecognizerDelegate {
    private let tabController = UITabBarController()
    private let feedback = UISelectionFeedbackGenerator()
    private var tabs: [TabDefinition] = []
    private var tabIDs: [String] = []
    private var activeTab = "plan"
    private var mode = "glass"
    private var dark = true
    private var isVisible = true
    private var isProgrammaticSelection = false
    private var onSelect: ((String) -> Void)?
    private var containerView: NativeTabContainerView { view as! NativeTabContainerView }

    override func loadView() {
        view = NativeTabContainerView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        view.isOpaque = false
        view.isUserInteractionEnabled = true
        view.clipsToBounds = false

        // Swap in the taller bar before touching tabController.tabBar anywhere
        // else — the getter lazily creates (and the controller starts laying
        // out) the stock bar on first access, so this must run first.
        tabController.setValue(TallGlassTabBar(), forKey: "tabBar")

        tabController.delegate = self
        tabController.view.backgroundColor = .clear
        tabController.view.isOpaque = false
        tabController.view.clipsToBounds = false
        tabController.tabBar.isTranslucent = true
        tabController.tabBar.clipsToBounds = false
        tabController.tabBar.layer.masksToBounds = false

        if #available(iOS 18, *) {
            tabController.mode = .tabBar
        }
        if #available(iOS 26, *) {
            tabController.tabBarMinimizeBehavior = .never
        }

        addChild(tabController)
        tabController.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tabController.view)
        tabController.didMove(toParent: self)

        NSLayoutConstraint.activate([
            tabController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabController.view.topAnchor.constraint(equalTo: view.topAnchor),
            tabController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handleTabBarPan(_:)))
        pan.cancelsTouchesInView = false
        pan.delegate = self
        tabController.tabBar.addGestureRecognizer(pan)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        normalizeTransparentHost()
    }

    func configure(
        tabs: [TabDefinition],
        activeTab: String,
        mode: String,
        dark: Bool,
        onSelect: @escaping (String) -> Void
    ) {
        self.mode = mode
        self.dark = dark
        self.onSelect = onSelect

        if shouldRebuildTabs(with: tabs) {
            rebuildTabs(tabs)
        }

        applyInterfaceStyle(dark: dark)
        update(activeTab: activeTab)
        setVisible(isVisible)
        normalizeTransparentHost()
    }

    func update(activeTab: String) {
        guard !activeTab.isEmpty else { return }
        self.activeTab = activeTab

        guard let index = tabIDs.firstIndex(of: activeTab),
              tabController.selectedIndex != index else {
            return
        }

        isProgrammaticSelection = true
        tabController.selectedIndex = index
        isProgrammaticSelection = false
    }

    func update(mode: String, dark: Bool) {
        self.mode = mode
        self.dark = dark
        applyInterfaceStyle(dark: dark)
        normalizeTransparentHost()
    }

    func setVisible(_ visible: Bool) {
        isVisible = visible
        view.isHidden = !visible
        view.isUserInteractionEnabled = visible

        if #available(iOS 18, *) {
            tabController.setTabBarHidden(!visible, animated: false)
        } else {
            tabController.tabBar.isHidden = !visible
        }

        if visible {
            normalizeTransparentHost()
        } else {
            containerView.interactiveFrame = .null
            view.layer.mask = nil
        }
    }

    private func shouldRebuildTabs(with newTabs: [TabDefinition]) -> Bool {
        let oldSignature = tabs.map { "\($0.id):\($0.label):\($0.sfSymbol)" }
        let newSignature = newTabs.map { "\($0.id):\($0.label):\($0.sfSymbol)" }
        return oldSignature != newSignature
    }

    private func rebuildTabs(_ tabs: [TabDefinition]) {
        self.tabs = tabs
        self.tabIDs = tabs.map(\.id)

        let viewControllers = tabs.enumerated().map { index, tab in
            let vc = NativeTabContentViewController()
            vc.view.backgroundColor = .clear
            vc.view.isOpaque = false
            vc.tabBarItem = UITabBarItem(
                title: tab.label,
                image: UIImage(systemName: tab.sfSymbol),
                selectedImage: UIImage(systemName: tab.sfSymbol)
            )
            vc.tabBarItem.tag = index
            return vc
        }

        tabController.setViewControllers(viewControllers, animated: false)
        tabController.customizableViewControllers = []
    }

    private func applyInterfaceStyle(dark: Bool) {
        let style: UIUserInterfaceStyle = dark ? .dark : .light
        overrideUserInterfaceStyle = style
        view.overrideUserInterfaceStyle = style
        tabController.overrideUserInterfaceStyle = style
        tabController.view.overrideUserInterfaceStyle = style
        tabController.children.forEach {
            $0.overrideUserInterfaceStyle = style
            $0.view.overrideUserInterfaceStyle = style
        }

        tabController.tabBar.tintColor = .systemBlue
        tabController.tabBar.isTranslucent = true
        applyTransparentTabBarAppearance()
    }

    // UITabBarAppearance owns the fallback backing panel. Keep that transparent
    // so iOS 26 can render only its floating Liquid Glass tab bar.
    private func applyTransparentTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.backgroundColor = .clear
        appearance.backgroundEffect = nil
        appearance.shadowColor = .clear
        appearance.shadowImage = UIImage()

        tabController.tabBar.standardAppearance = appearance
        tabController.tabBar.scrollEdgeAppearance = appearance
        tabController.tabBar.backgroundImage = UIImage()
        tabController.tabBar.shadowImage = UIImage()
    }

    private func normalizeTransparentHost() {
        guard isVisible, view.bounds.width > 0, view.bounds.height > 0 else { return }

        clearSurfacesOutsideSystemTabBar(in: view)

        let tabFrame = tabController.tabBar.convert(tabController.tabBar.bounds, to: view)
        if tabFrame.width > 0, tabFrame.height > 0 {
            containerView.interactiveFrame = visibleFrame(for: tabFrame)
        } else {
            containerView.interactiveFrame = fallbackTabBarFrame()
        }
    }

    private func clearSurfacesOutsideSystemTabBar(in root: UIView) {
        if root === tabController.tabBar {
            return
        }

        root.backgroundColor = .clear
        root.isOpaque = false
        root.clipsToBounds = false

        for subview in root.subviews {
            clearSurfacesOutsideSystemTabBar(in: subview)
        }
    }

    private func visibleFrame(for tabFrame: CGRect) -> CGRect {
        let bounds = view.bounds
        let safeBottom = view.safeAreaInsets.bottom
        let bottomGuard = max(safeBottom - 2, 0)
        let xInset: CGFloat = 12
        let topAllowance: CGFloat = 14
        let bottomAllowance: CGFloat = 8

        let x = max(tabFrame.minX, xInset)
        let y = max(tabFrame.minY - topAllowance, 0)
        let maxBottom = max(bounds.height - bottomGuard, y)
        let height = max(min(tabFrame.maxY + bottomAllowance, maxBottom) - y, tabFrame.height)

        return CGRect(
            x: x,
            y: y,
            width: min(tabFrame.width, bounds.width - (x * 2)),
            height: min(height, bounds.height - y)
        )
    }

    private func fallbackTabBarFrame() -> CGRect {
        let bounds = view.bounds
        let safeBottom = view.safeAreaInsets.bottom
        let height: CGFloat = 74
        let bottomInset = max(safeBottom - 2, 8)

        return CGRect(
            x: 16,
            y: max(bounds.height - bottomInset - height, 0),
            width: max(bounds.width - 32, 0),
            height: height
        )
    }

    private func selectTab(at index: Int, notify: Bool) {
        guard tabIDs.indices.contains(index) else { return }

        let tabID = tabIDs[index]
        activeTab = tabID

        if tabController.selectedIndex != index {
            isProgrammaticSelection = !notify
            tabController.selectedIndex = index
            isProgrammaticSelection = false
        }

        feedback.selectionChanged()

        if notify {
            onSelect?(tabID)
        }
    }

    private func tabIndex(at location: CGPoint) -> Int? {
        let count = max(tabIDs.count, 1)
        guard tabController.tabBar.bounds.contains(location), count > 0 else { return nil }

        let segmentWidth = tabController.tabBar.bounds.width / CGFloat(count)
        guard segmentWidth > 0 else { return nil }

        let rawIndex = Int(location.x / segmentWidth)
        return min(max(rawIndex, 0), count - 1)
    }

    @objc private func handleTabBarPan(_ gesture: UIPanGestureRecognizer) {
        let location = gesture.location(in: tabController.tabBar)

        switch gesture.state {
        case .began:
            feedback.prepare()
            fallthrough
        case .changed:
            guard let index = tabIndex(at: location) else { return }
            selectTab(at: index, notify: false)
        case .ended, .cancelled, .failed:
            let index = tabIndex(at: location) ?? tabController.selectedIndex
            selectTab(at: index, notify: true)
        default:
            break
        }
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        guard !isProgrammaticSelection,
              let index = tabBarController.viewControllers?.firstIndex(of: viewController) else {
            return
        }

        selectTab(at: index, notify: true)
    }

    @available(iOS 18, *)
    func tabBarController(_ tabBarController: UITabBarController, didSelectTab selectedTab: UITab, previousTab: UITab?) {
        guard !isProgrammaticSelection,
              let index = tabBarController.tabs.firstIndex(of: selectedTab) else {
            return
        }

        selectTab(at: index, notify: true)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        true
    }
}
