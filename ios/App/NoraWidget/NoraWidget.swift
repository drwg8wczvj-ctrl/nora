import WidgetKit
import SwiftUI

// ─── Data models ──────────────────────────────────────────────────────────────

struct WidgetTask: Codable, Identifiable {
    let id: String
    let title: String
    let completed: Bool
    let startHour: Int?
    let startMinute: Int?

    var timeLabel: String? {
        guard let h = startHour, let m = startMinute else { return nil }
        let h12  = h % 12 == 0 ? 12 : h % 12
        let ampm = h < 12 ? "AM" : "PM"
        return String(format: "%d:%02d %@", h12, m, ampm)
    }
}

struct WidgetData: Codable {
    let date: String
    let lastUpdated: String
    let totalToday: Int
    let completedToday: Int
    let todayTasks: [WidgetTask]
    let energy: Int
    let focus: Int
    let relaxation: Int
    let readinessLabel: String
    let readinessPct: Int

    var progress: Double {
        totalToday > 0 ? Double(completedToday) / Double(totalToday) : 0
    }

    static var placeholder: WidgetData {
        WidgetData(
            date: "Monday, Jun 29",
            lastUpdated: "",
            totalToday: 5,
            completedToday: 2,
            todayTasks: [
                WidgetTask(id: "1", title: "Morning review",       completed: true,  startHour: 9,  startMinute: 0),
                WidgetTask(id: "2", title: "Team standup",         completed: false, startHour: 10, startMinute: 30),
                WidgetTask(id: "3", title: "Deep work session",    completed: false, startHour: 14, startMinute: 0),
                WidgetTask(id: "4", title: "Review pull requests", completed: false, startHour: 16, startMinute: 0),
            ],
            energy: 7, focus: 8, relaxation: 6,
            readinessLabel: "Stable",
            readinessPct: 72
        )
    }
}

// ─── Data provider ────────────────────────────────────────────────────────────

struct NoraProvider: TimelineProvider {
    private let appGroupID = "group.tech.dongar.nora"
    private let storageKey = "nora_widget_data"

    func load() -> WidgetData {
        guard
            let defaults   = UserDefaults(suiteName: appGroupID),
            let jsonString = defaults.string(forKey: storageKey),
            let jsonData   = jsonString.data(using: .utf8),
            let data       = try? JSONDecoder().decode(WidgetData.self, from: jsonData)
        else { return .placeholder }
        return data
    }

    func placeholder(in context: Context) -> NoraEntry {
        NoraEntry(date: Date(), data: .placeholder, isPlaceholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (NoraEntry) -> Void) {
        completion(NoraEntry(date: Date(), data: load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NoraEntry>) -> Void) {
        let entry   = NoraEntry(date: Date(), data: load())
        // Widgets refresh every 15 min; the main app also calls reloadAllTimelines
        // on every state change so the data is usually much fresher than that.
        let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }
}

struct NoraEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
    var isPlaceholder: Bool = false
}

// ─── Brand colours ────────────────────────────────────────────────────────────

private let noraAccent   = Color(red: 0.545, green: 0.361, blue: 0.965)   // #8b5cf6
private let noraOrange   = Color(red: 0.976, green: 0.620, blue: 0.082)   // #f99d15
private let noraTeal     = Color(red: 0.122, green: 0.706, blue: 0.659)   // #1fb4a8
private let noraBg       = Color(red: 0.071, green: 0.059, blue: 0.133)   // dark bg
private let noraSurface  = Color(red: 0.110, green: 0.094, blue: 0.188)   // card bg

// ─── Reusable sub-views ───────────────────────────────────────────────────────

private struct TaskRow: View {
    let task: WidgetTask

    var body: some View {
        HStack(spacing: 7) {
            ZStack {
                Circle()
                    .strokeBorder(
                        task.completed ? noraAccent : Color.white.opacity(0.3),
                        lineWidth: 1.5
                    )
                    .background(Circle().fill(task.completed ? noraAccent : Color.clear))
                if task.completed {
                    Image(systemName: "checkmark")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: 15, height: 15)

            Text(task.title)
                .font(.system(size: 12, weight: task.completed ? .regular : .medium))
                .foregroundColor(task.completed ? .white.opacity(0.4) : .white)
                .strikethrough(task.completed, color: .white.opacity(0.4))
                .lineLimit(1)

            Spacer()

            if let t = task.timeLabel {
                Text(t)
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
    }
}

private struct RingView: View {
    let value: Int       // 0–10
    let label: String
    let color: Color
    var ringSize: CGFloat = 50

    private var pct: Double { Double(value) / 10.0 }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.22), lineWidth: 5)
                Circle()
                    .trim(from: 0, to: pct)
                    .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(value)")
                    .font(.system(size: ringSize * 0.28, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .frame(width: ringSize, height: ringSize)

            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.55))
        }
    }
}

private struct ProgressRing: View {
    let progress: Double
    let completed: Int
    let total: Int
    var size: CGFloat = 80

    var body: some View {
        ZStack {
            Circle()
                .stroke(noraAccent.opacity(0.18), lineWidth: size * 0.10)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(noraAccent, style: StrokeStyle(lineWidth: size * 0.10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeInOut(duration: 0.6), value: progress)
            VStack(spacing: 1) {
                Text("\(completed)")
                    .font(.system(size: size * 0.28, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("/ \(total)")
                    .font(.system(size: size * 0.14, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
        .frame(width: size, height: size)
    }
}

// ─── Small widget (2×2): ring + readiness badge ───────────────────────────────

private struct SmallView: View {
    let data: WidgetData

    var body: some View {
        ZStack {
            noraBg.ignoresSafeArea()

            VStack(spacing: 10) {
                ProgressRing(progress: data.progress,
                             completed: data.completedToday,
                             total: data.totalToday,
                             size: 76)

                Text("tasks today")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))

                Text(data.readinessLabel)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(noraAccent.opacity(0.18))
                    .foregroundColor(noraAccent)
                    .clipShape(Capsule())
            }
            .padding(12)
        }
    }
}

// ─── Medium Schedule widget (4×2): today's task list ─────────────────────────

private struct MediumScheduleView: View {
    let data: WidgetData

    private var displayTasks: [WidgetTask] { Array(data.todayTasks.prefix(4)) }

    var body: some View {
        ZStack {
            noraBg.ignoresSafeArea()

            HStack(alignment: .top, spacing: 14) {
                // Left: date + mini progress
                VStack(alignment: .leading, spacing: 0) {
                    Text("Today")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.45))

                    Text(data.date.components(separatedBy: ",").first ?? data.date)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.top, 2)

                    Spacer()

                    ProgressRing(progress: data.progress,
                                 completed: data.completedToday,
                                 total: data.totalToday,
                                 size: 56)

                    Spacer()

                    Text(data.readinessLabel)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(noraAccent)
                }
                .frame(width: 72)

                Rectangle()
                    .fill(Color.white.opacity(0.08))
                    .frame(width: 1)

                // Right: tasks
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(displayTasks) { task in TaskRow(task: task) }
                    if data.totalToday > 4 {
                        Text("+ \(data.totalToday - 4) more")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.35))
                    }
                    Spacer()
                }
            }
            .padding(14)
        }
    }
}

// ─── Medium Stats widget (4×2): energy / focus / calm / tasks rings ───────────

private struct MediumStatsView: View {
    let data: WidgetData

    var body: some View {
        ZStack {
            noraBg.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: "sparkles")
                        .foregroundColor(noraAccent)
                        .font(.system(size: 12))
                    Text("Nora · Today")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.55))
                    Spacer()
                    Text(data.date.components(separatedBy: ",").first ?? "")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.4))
                }

                HStack(spacing: 0) {
                    RingView(value: data.energy,    label: "Energy",  color: noraOrange)
                    Spacer()
                    RingView(value: data.focus,     label: "Focus",   color: noraAccent)
                    Spacer()
                    RingView(value: data.relaxation, label: "Calm",   color: noraTeal)
                    Spacer()
                    // Tasks ring
                    VStack(spacing: 4) {
                        ProgressRing(progress: data.progress,
                                     completed: data.completedToday,
                                     total: data.totalToday,
                                     size: 50)
                        Text("Tasks")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.55))
                    }
                }
            }
            .padding(14)
        }
    }
}

// ─── Large widget (4×4): full schedule + stats footer ────────────────────────

private struct LargeView: View {
    let data: WidgetData

    private var displayTasks: [WidgetTask] { Array(data.todayTasks.prefix(7)) }

    var body: some View {
        ZStack {
            noraBg.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 12) {
                // Header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(data.date)
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("\(data.completedToday) of \(data.totalToday) tasks · \(data.readinessLabel)")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    Spacer()
                    ProgressRing(progress: data.progress,
                                 completed: data.completedToday,
                                 total: data.totalToday,
                                 size: 52)
                }

                Rectangle()
                    .fill(Color.white.opacity(0.08))
                    .frame(height: 1)

                // Tasks
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(displayTasks) { task in TaskRow(task: task) }
                    if data.totalToday > 7 {
                        Text("+ \(data.totalToday - 7) more tasks")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.35))
                    }
                }

                Spacer()

                Rectangle()
                    .fill(Color.white.opacity(0.08))
                    .frame(height: 1)

                // Stats footer
                HStack(spacing: 0) {
                    ForEach([
                        ("Energy", data.energy, noraOrange),
                        ("Focus",  data.focus,  noraAccent),
                        ("Calm",   data.relaxation, noraTeal),
                    ], id: \.0) { label, val, color in
                        HStack(spacing: 5) {
                            Circle().fill(color).frame(width: 6, height: 6)
                            Text(label)
                                .font(.system(size: 10))
                                .foregroundColor(.white.opacity(0.5))
                            Text("\(val)/10")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        if label != "Calm" { Spacer() }
                    }
                }
            }
            .padding(16)
        }
    }
}

// ─── Widget configurations ────────────────────────────────────────────────────

struct NoraScheduleWidget: Widget {
    let kind = "NoraScheduleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NoraProvider()) { entry in
            NoraScheduleEntryView(entry: entry)
                .widgetURL(URL(string: "nora://open"))
        }
        .configurationDisplayName("Nora · Schedule")
        .description("Today's tasks and your daily progress.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct NoraStatsWidget: Widget {
    let kind = "NoraStatsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NoraProvider()) { entry in
            MediumStatsView(data: entry.data)
                .widgetURL(URL(string: "nora://open"))
        }
        .configurationDisplayName("Nora · Wellbeing")
        .description("Your energy, focus, and calm levels at a glance.")
        .supportedFamilies([.systemMedium])
    }
}

// Route the right view per family for the schedule widget
private struct NoraScheduleEntryView: View {
    let entry: NoraEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:  SmallView(data: entry.data)
        case .systemLarge:  LargeView(data: entry.data)
        default:            MediumScheduleView(data: entry.data)
        }
    }
}
