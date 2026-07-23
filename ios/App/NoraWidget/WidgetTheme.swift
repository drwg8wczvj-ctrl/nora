import SwiftUI
import WidgetKit
import AppIntents

// ─── Brand colors — vivid enough to read on both a light and dark
// background, matching the main app's own dual-theme accent palette. Text
// uses .primary/.secondary throughout instead of hardcoded white so every
// view here is correct in Light and Dark Mode with zero extra branching. ──

enum NoraColor {
    static let accent  = Color(red: 0.545, green: 0.361, blue: 0.965)  // #8b5cf6
    static let orange  = Color(red: 0.976, green: 0.620, blue: 0.082)  // #f99d15
    static let teal    = Color(red: 0.122, green: 0.706, blue: 0.659)  // #1fb4a8
    static let green   = Color(red: 0.133, green: 0.773, blue: 0.369)  // #22c55e
    static let amber   = Color(red: 0.961, green: 0.620, blue: 0.043)  // #f59e0b
    static let red     = Color(red: 0.937, green: 0.267, blue: 0.267)  // #ef4444

    /// Matches the main app's status-bucket color convention so a widget's
    /// "Stable" / "Mild" / "Burnout Risk" reads the same color as the app.
    static func forBucket(_ label: String) -> Color {
        let l = label.lowercased()
        if l.contains("stable") || l.contains("high") || l.contains("steady") || l.contains("rising") || l.contains("charged") { return green }
        if l.contains("mild") || l.contains("moderate") || l.contains("building") || l.contains("variable") || l.contains("adequate") || l.contains("unstable") { return amber }
        if l.contains("burnout") || l.contains("recovery needed") || l.contains("erratic") || l.contains("low") || l.contains("depleted") || l.contains("overloaded") { return red }
        return accent
    }
}

// Container background — required by WidgetKit since iOS 17; without this
// call the system discards any custom background entirely (this was the
// root cause of the widgets rendering blank/white). Centralized here so
// every widget kind applies it identically.
extension View {
    func noraContainerBackground() -> some View {
        containerBackground(for: .widget) {
            Color("WidgetBackground")
        }
    }
}

// ─── Reusable sub-views ──────────────────────────────────────────────────

struct SectionLabel: View {
    let text: String
    var icon: String? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).font(.system(size: 10, weight: .semibold)) }
            Text(text.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .kerning(0.4)
        }
        .foregroundStyle(.secondary)
    }
}

struct TaskRow: View {
    let task: WidgetTask

    var body: some View {
        HStack(spacing: 7) {
            ZStack {
                Circle()
                    .strokeBorder(task.completed ? NoraColor.accent : Color.secondary.opacity(0.35), lineWidth: 1.5)
                    .background(Circle().fill(task.completed ? NoraColor.accent : Color.clear))
                if task.completed {
                    Image(systemName: "checkmark")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: 15, height: 15)

            Text(task.title)
                .font(.system(size: 12, weight: task.completed ? .regular : .medium))
                .foregroundStyle(task.completed ? .tertiary : .primary)
                .strikethrough(task.completed, color: .secondary)
                .lineLimit(1)

            Spacer(minLength: 4)

            if let t = task.timeLabel {
                Text(t)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Same look as TaskRow, but the checkbox is a real interactive button (iOS
/// 17+ widget App Intents) — tapping it completes the task without opening
/// the app. Used wherever individual tasks are shown on Home Screen sizes;
/// Lock Screen accessory views stay read-only (TaskRow), since interactive
/// buttons aren't supported there.
struct InteractiveTaskRow: View {
    let task: WidgetTask

    var body: some View {
        HStack(spacing: 7) {
            Button(intent: CompleteTaskIntent(taskId: task.id)) {
                ZStack {
                    Circle()
                        .strokeBorder(task.completed ? NoraColor.accent : Color.secondary.opacity(0.35), lineWidth: 1.5)
                        .background(Circle().fill(task.completed ? NoraColor.accent : Color.clear))
                    if task.completed {
                        Image(systemName: "checkmark")
                            .font(.system(size: 7, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 15, height: 15)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(task.completed)

            Text(task.title)
                .font(.system(size: 12, weight: task.completed ? .regular : .medium))
                .foregroundStyle(task.completed ? .tertiary : .primary)
                .strikethrough(task.completed, color: .secondary)
                .lineLimit(1)

            Spacer(minLength: 4)

            if let t = task.timeLabel {
                Text(t)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// A labeled 0-10 dial (energy / focus / calm) — value drives both the fill
/// fraction and the number shown in the center.
struct DialView: View {
    let value: Int
    let label: String
    let color: Color
    var ringSize: CGFloat = 50

    private var pct: Double { Double(value) / 10.0 }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle().stroke(color.opacity(0.2), lineWidth: 5)
                Circle()
                    .trim(from: 0, to: pct)
                    .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(value)")
                    .font(.system(size: ringSize * 0.28, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
            }
            .frame(width: ringSize, height: ringSize)

            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
    }
}

/// A labeled 0-100 metric dial (Recovery Index / Mental Battery / Momentum /
/// Deep Work Capacity) — same visual language as DialView but for the
/// AI-computed status metrics, colored by bucket rather than a fixed hue.
struct MetricDialView: View {
    let metric: WidgetMetric?
    let label: String
    var ringSize: CGFloat = 50

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                let color = metric?.value != nil ? NoraColor.forBucket(metric!.label) : Color.secondary
                Circle().stroke(color.opacity(0.2), lineWidth: 5)
                if let value = metric?.value {
                    Circle()
                        .trim(from: 0, to: Double(value) / 100.0)
                        .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(value)")
                        .font(.system(size: ringSize * 0.28, weight: .bold, design: .rounded))
                        .foregroundStyle(.primary)
                } else {
                    Text("–")
                        .font(.system(size: ringSize * 0.28, weight: .bold, design: .rounded))
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(width: ringSize, height: ringSize)

            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
    }
}

struct ProgressRing: View {
    let progress: Double
    let completed: Int
    let total: Int
    var size: CGFloat = 80

    var body: some View {
        ZStack {
            Circle().stroke(NoraColor.accent.opacity(0.18), lineWidth: size * 0.10)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(NoraColor.accent, style: StrokeStyle(lineWidth: size * 0.10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 1) {
                Text("\(completed)")
                    .font(.system(size: size * 0.28, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                Text("/ \(total)")
                    .font(.system(size: size * 0.14, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
    }
}

struct Divider1px: View {
    var body: some View {
        Rectangle().fill(Color.secondary.opacity(0.15)).frame(height: 1)
    }
}

func minutesLabel(_ minutes: Int) -> String {
    let h = minutes / 60, m = minutes % 60
    return m == 0 ? "\(h)h" : "\(h)h \(m)m"
}
