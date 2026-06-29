# Nora iOS Widget — Setup Guide

Everything in this folder is ready. You only need Xcode.

---

## Prerequisites
- Xcode 15+ from the App Store
- Apple Developer account (free for device testing, $99/yr for App Store)

---

## Step 1 — Add the iOS platform

```bash
npm run build          # build the React app first
npx cap add ios        # creates ios/ folder
npx cap sync           # copies build + plugins into ios/
```

---

## Step 2 — Open the project in Xcode

```bash
![alt text](image.png)
```

This opens `ios/App/App.xcworkspace`.

---

## Step 3 — Add the Capacitor plugin

1. In Xcode, select the **App** target in the left sidebar → click the `App` folder.
2. Drag **both** files from `ios-sources/Plugin/` into the `App/App/` group:
   - `NoraWidgetBridgePlugin.swift`
   - `NoraWidgetBridgePlugin.m`
3. When prompted, tick **"Add to target: App"**.

---

## Step 4 — Create the Widget Extension target

1. **File → New → Target…**
2. Choose **Widget Extension** → Next![alt text](image-1.png)
3. Set:
   - **Product Name**: `NoraWidget`
   - **Bundle Identifier**: `tech.dongar.nora.widget`
   - **Include Configuration App Intent**: OFF (leave unchecked)
4. Click Finish → when asked "Activate scheme?" → **Activate**.

---

## Step 5 — Replace the generated widget files

Xcode generates placeholder Swift files. Replace them with the ready-made ones:

1. In the `NoraWidget` group in Xcode, **delete** the generated `.swift` files (move to trash).
2. Drag **both** files from `ios-sources/NoraWidget/` into the `NoraWidget` group:
   - `NoraWidget.swift`
   - `NoraWidgetBundle.swift`
3. Make sure **"Add to target: NoraWidget"** is ticked.

---

## Step 6 — Configure App Groups (critical)

The App Group is how the main app passes data to the widget.

### For the **App** target:
1. Select the **App** target → **Signing & Capabilities** tab.
2. Click **+ Capability** → add **App Groups**.
3. Click **+** under App Groups → enter: `group.tech.dongar.nora`

### For the **NoraWidget** target:
1. Select the **NoraWidget** target → **Signing & Capabilities** tab.
2. Add **App Groups** → use the **same** group: `group.tech.dongar.nora`

---

## Step 7 — Build & run

1. Select your iPhone as the run target.
2. **Product → Run** (⌘R).
3. Once the app launches on your phone, go to the Home Screen → long press → tap **+** → search "Nora".
4. You'll see two widget options:
   - **Nora · Schedule** — small / medium / large (tasks + progress ring)
   - **Nora · Wellbeing** — medium only (energy / focus / calm rings)

---

## How it updates

Every time you open the Nora app and your tasks or dials change, the app writes fresh data to the App Group and calls `WidgetCenter.reloadAllTimelines()`. The widget updates instantly without any network call. WidgetKit also refreshes on its own schedule every ~15 minutes.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Widget shows placeholder data | Open the Nora app once so it writes data to the App Group |
| Widget never updates | Double-check both targets have the **same** App Group ID |
| Build error in plugin | Make sure `NoraWidgetBridgePlugin.m` is added to the **App** target, not the widget |
| "App Group not configured" in Xcode logs | Signing & Capabilities → App Groups must be enabled and match on both targets |
