import WidgetKit
import SwiftUI

// ─── Timeline provider ───────────────────────────────────────────────────
// Pre-schedules the day's morning/afternoon/evening transitions up front so
// WidgetKit can switch between already-rendered entries at the right moment
// with zero extra wake-ups — the app's own reloadAllTimelines() call (fired
// on every real data change) is what keeps content fresh; this schedule only
// covers the time-of-day dimension (see Part 5 / Part 11 of the brief).

struct NoraProvider: TimelineProvider {
    func placeholder(in context: Context) -> NoraEntry {
        NoraEntry(date: Date(), data: .placeholder, phase: .morning, isPlaceholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (NoraEntry) -> Void) {
        let data = WidgetStore.load()
        let hour = Calendar.current.component(.hour, from: Date())
        completion(NoraEntry(date: Date(), data: data, phase: DayPhase.forHour(hour)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NoraEntry>) -> Void) {
        let data = WidgetStore.load()
        let calendar = Calendar.current
        let now = Date()
        let todayStart = calendar.startOfDay(for: now)

        var entries: [NoraEntry] = [
            NoraEntry(date: now, data: data, phase: DayPhase.forHour(calendar.component(.hour, from: now))),
        ]
        for hour in [5, 12, 18] {
            guard let date = calendar.date(byAdding: .hour, value: hour, to: todayStart), date > now else { continue }
            entries.append(NoraEntry(date: date, data: data, phase: DayPhase.forHour(hour)))
        }
        if let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: todayStart),
           let tomorrowMorning = calendar.date(byAdding: .hour, value: 5, to: tomorrowStart) {
            entries.append(NoraEntry(date: tomorrowMorning, data: data, phase: .morning))
        }

        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// ─── Small (2×2): time-of-day adaptive hero + compact progress ───────────

private struct SmallView: View {
    let entry: NoraEntry
    private var data: WidgetData { entry.data }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Image(systemName: phaseIcon).font(.system(size: 11, weight: .semibold))
                Text(phaseLabel).font(.system(size: 11, weight: .semibold)).kerning(0.4)
                Spacer()
            }
            .foregroundStyle(.secondary)

            Spacer(minLength: 0)
            phaseHero
            Spacer(minLength: 0)

            HStack(spacing: 8) {
                ProgressRing(progress: data.progress, completed: data.completedToday, total: data.totalToday, size: 32)
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(data.completedToday)/\(data.totalToday)").font(.system(size: 12, weight: .bold, design: .rounded))
                    Text("tasks today").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .noraContainerBackground()
    }

    private var phaseIcon: String {
        switch entry.phase {
        case .morning:   return "sunrise.fill"
        case .afternoon: return "sun.max.fill"
        case .evening:   return "moon.stars.fill"
        }
    }
    private var phaseLabel: String {
        switch entry.phase {
        case .morning:   return "MORNING"
        case .afternoon: return "TODAY"
        case .evening:   return "EVENING"
        }
    }

    @ViewBuilder private var phaseHero: some View {
        switch entry.phase {
        case .morning:
            if let sleep = data.health?.sleepLastNightMinutes {
                heroStat(minutesLabel(sleep), "slept last night")
            } else if let next = data.nextTask {
                heroTask(next, prefix: "First up")
            } else {
                heroStat("Clear", "nothing scheduled yet")
            }
        case .afternoon:
            if let next = data.nextTask {
                heroTask(next, prefix: "Next up")
            } else {
                heroStat("All done", "you're caught up")
            }
        case .evening:
            if let recovery = data.metrics?.recoveryIndex, let value = recovery.value {
                heroStat("\(value)", "recovery score", color: NoraColor.forBucket(recovery.label))
            } else {
                heroStat("\(data.completedToday)/\(data.totalToday)", "tasks completed today")
            }
        }
    }

    private func heroStat(_ value: String, _ caption: String, color: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(color)
            Text(caption).font(.system(size: 11)).foregroundStyle(.secondary)
        }
    }

    private func heroTask(_ task: WidgetTask, prefix: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(prefix.uppercased()).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
            Text(task.title).font(.system(size: 15, weight: .bold)).lineLimit(2)
            if let t = task.timeLabel { Text(t).font(.system(size: 11)).foregroundStyle(.secondary) }
        }
    }
}

// ─── Medium (4×2): today's schedule, next task, remaining deep work ─────

private struct MediumScheduleView: View {
    let data: WidgetData
    private var displayTasks: [WidgetTask] { Array(data.todayTasks.prefix(4)) }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                Text("TODAY").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary).kerning(0.4)
                Text(data.date.components(separatedBy: ",").first ?? data.date)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .padding(.top, 2)

                Spacer(minLength: 6)
                ProgressRing(progress: data.progress, completed: data.completedToday, total: data.totalToday, size: 56)
                Spacer(minLength: 6)

                if data.remainingDeepWorkCount > 0 {
                    Label("\(data.remainingDeepWorkCount) Deep Work", systemImage: "brain.head.profile")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(NoraColor.accent)
                        .labelStyle(.titleOnly)
                        .lineLimit(2)
                } else {
                    Text(data.readinessLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(NoraColor.forBucket(data.readinessLabel))
                }
            }
            .frame(width: 76)

            Divider1px().frame(width: 1)

            VStack(alignment: .leading, spacing: 7) {
                if let next = data.nextTask {
                    HStack(spacing: 4) {
                        Image(systemName: "clock.fill").font(.system(size: 10)).foregroundStyle(NoraColor.accent)
                        Text("Next: \(next.title)").font(.system(size: 11.5, weight: .semibold)).lineLimit(1)
                        Spacer()
                        if let start = next.startHour {
                            Text(countdownLabel(hour: start, minute: next.startMinute ?? 0)).font(.system(size: 10.5)).foregroundStyle(.secondary)
                        }
                    }
                    Divider1px()
                }
                ForEach(displayTasks) { task in InteractiveTaskRow(task: task) }
                if data.totalToday > 4 {
                    Text("+ \(data.totalToday - 4) more").font(.system(size: 11)).foregroundStyle(.tertiary)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .noraContainerBackground()
    }
}

// ─── Large (4×4): full schedule + wellbeing footer ───────────────────────

private struct LargeView: View {
    let data: WidgetData
    private var displayTasks: [WidgetTask] { Array(data.todayTasks.prefix(7)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(data.date).font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("\(data.completedToday) of \(data.totalToday) tasks · \(data.readinessLabel)")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                    if data.remainingDeepWorkCount > 0 {
                        Label("\(data.remainingDeepWorkCount) Deep Work session\(data.remainingDeepWorkCount == 1 ? "" : "s") left", systemImage: "brain.head.profile")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(NoraColor.accent)
                    }
                }
                Spacer()
                ProgressRing(progress: data.progress, completed: data.completedToday, total: data.totalToday, size: 52)
            }

            Divider1px()

            VStack(alignment: .leading, spacing: 8) {
                ForEach(displayTasks) { task in InteractiveTaskRow(task: task) }
                if data.totalToday > 7 {
                    Text("+ \(data.totalToday - 7) more tasks").font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }

            Spacer(minLength: 0)
            Divider1px()

            HStack(spacing: 0) {
                statChip("Energy", data.energy, NoraColor.orange)
                Spacer()
                statChip("Focus", data.focus, NoraColor.accent)
                Spacer()
                statChip("Calm", data.relaxation, NoraColor.teal)
                Spacer()
                if let mb = data.metrics?.mentalBattery, let value = mb.value {
                    HStack(spacing: 5) {
                        Circle().fill(NoraColor.forBucket(mb.label)).frame(width: 6, height: 6)
                        Text("Battery").font(.system(size: 11)).foregroundStyle(.secondary)
                        Text("\(value)%").font(.system(size: 11, weight: .semibold))
                    }
                }
            }
        }
        .padding(16)
        .noraContainerBackground()
    }

    private func statChip(_ label: String, _ value: Int, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label).font(.system(size: 11)).foregroundStyle(.secondary)
            Text("\(value)/10").font(.system(size: 11, weight: .semibold))
        }
    }
}

private func countdownLabel(hour: Int, minute: Int) -> String {
    let calendar = Calendar.current
    guard let date = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) else { return "" }
    if date < Date() { return "now" }
    let mins = calendar.dateComponents([.minute], from: Date(), to: date).minute ?? 0
    if mins < 60 { return "in \(mins)m" }
    let hrs = mins / 60, rem = mins % 60
    return rem == 0 ? "in \(hrs)h" : "in \(hrs)h \(rem)m"
}

// ─── Lock Screen / accessory views ────────────────────────────────────────

private struct AccessoryCircularView: View {
    let data: WidgetData
    var body: some View {
        Gauge(value: data.progress) {
            Image(systemName: "checkmark.circle")
        } currentValueLabel: {
            Text("\(data.completedToday)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .noraContainerBackground()
    }
}

private struct AccessoryRectangularView: View {
    let data: WidgetData
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let next = data.nextTask {
                Text(next.title).font(.headline).lineLimit(1)
                if let t = next.timeLabel { Text(t).font(.caption) }
            } else {
                Text("All caught up").font(.headline)
                Text("\(data.completedToday)/\(data.totalToday) done").font(.caption)
            }
        }
        .widgetAccentable()
        .noraContainerBackground()
    }
}

private struct AccessoryInlineView: View {
    let data: WidgetData
    var body: some View {
        if let next = data.nextTask {
            Label(next.title, systemImage: "circle")
        } else {
            Label("\(data.completedToday)/\(data.totalToday) done", systemImage: "checkmark.circle")
        }
    }
}

// ─── Widget configuration ─────────────────────────────────────────────────

struct NoraScheduleWidget: Widget {
    let kind = "NoraScheduleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NoraProvider()) { entry in
            NoraScheduleEntryView(entry: entry)
                .widgetURL(URL(string: "nora://planner"))
        }
        .configurationDisplayName("Nora · Planner")
        .description("Today's schedule, next task, and daily progress.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private struct NoraScheduleEntryView: View {
    let entry: NoraEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:          SmallView(entry: entry)
        case .systemLarge:          LargeView(data: entry.data)
        case .accessoryCircular:    AccessoryCircularView(data: entry.data)
        case .accessoryRectangular: AccessoryRectangularView(data: entry.data)
        case .accessoryInline:      AccessoryInlineView(data: entry.data)
        default:                    MediumScheduleView(data: entry.data)
        }
    }
}
