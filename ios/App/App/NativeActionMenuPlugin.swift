import Foundation
import UIKit
import Capacitor

// A single row in a native action sheet — id is opaque to the native side;
// the JS caller assigns meaning to it.
private struct ActionMenuItem {
    let id: String
    let label: String
    let style: String   // "default" | "destructive" | "cancel"
}

// Presents a real UIAlertController(.actionSheet) — native blur, native
// spring animation, native Dynamic Type, automatically a bottom sheet on
// iPhone and an anchored popover on iPad. Used for Nora's "..." / long-press
// action menus (rename, pin, archive, delete, etc.) wherever the menu's
// content is a short, known list of labeled actions rather than arbitrary
// app content — see NativeActionMenu.js for the JS-side contract.
@objc(NativeActionMenuPlugin)
public class NativeActionMenuPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeActionMenuPlugin"
    public let jsName = "NativeActionMenu"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
    ]

    @objc func show(_ call: CAPPluginCall) {
        guard let itemsRaw = call.getArray("actions") as? [[String: Any]], !itemsRaw.isEmpty else {
            call.reject("actions required")
            return
        }
        let title = call.getString("title")
        let message = call.getString("message")
        let items: [ActionMenuItem] = itemsRaw.compactMap {
            guard let id = $0["id"] as? String, let label = $0["label"] as? String else { return nil }
            return ActionMenuItem(id: id, label: label, style: $0["style"] as? String ?? "default")
        }
        let sourceRectDict = call.getObject("sourceRect")
        let sourceRect: CGRect? = sourceRectDict.flatMap { dict -> CGRect? in
            guard let x = dict["x"] as? Double, let y = dict["y"] as? Double,
                  let w = dict["width"] as? Double, let h = dict["height"] as? Double
            else { return nil }
            return CGRect(x: x, y: y, width: w, height: h)
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else {
                call.reject("nativeShellUnavailable")
                return
            }

            var didResolve = false
            let resolveOnce: (String?) -> Void = { id in
                guard !didResolve else { return }
                didResolve = true
                call.resolve(["selectedId": id ?? NSNull()])
            }

            let alert = UIAlertController(title: title, message: message, preferredStyle: .actionSheet)

            for item in items where item.style != "cancel" {
                let style: UIAlertAction.Style = item.style == "destructive" ? .destructive : .default
                alert.addAction(UIAlertAction(title: item.label, style: style) { _ in resolveOnce(item.id) })
            }
            let cancelLabel = items.first(where: { $0.style == "cancel" })?.label ?? "Cancel"
            alert.addAction(UIAlertAction(title: cancelLabel, style: .cancel) { _ in resolveOnce(nil) })

            // iPad crashes an .actionSheet-style alert with no popover anchor —
            // always provide one, falling back to a safe screen-center anchor
            // (no visible arrow) if the caller didn't pass a real source rect.
            if let popover = alert.popoverPresentationController {
                popover.sourceView = presenter.view
                if let sourceRect {
                    popover.sourceRect = sourceRect
                    popover.permittedArrowDirections = .any
                } else {
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                    popover.permittedArrowDirections = []
                }
            }

            presenter.present(alert, animated: true)
        }
    }
}
