import WidgetKit
import SwiftUI

// Shown whenever HealthKit isn't connected — never a fake number, always an
// honest, dismissible-feeling prompt (mirrors the app's own ConnectPrompt).
private struct HealthConnectPromptView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 22))
                .foregroundStyle(NoraColor.accent)
            Text("Connect Apple Health")
                .font(.system(size: 12, weight: .semibold))
            Text("in Nora Settings to see it here")
                .font(.system(size: 11.5))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .noraContainerBackground()
    }
}

private struct HealthSmallView: View {
    let health: WidgetHealth

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Health", icon: "heart.fill")
            Spacer(minLength: 0)
            if let sleep = health.sleepLastNightMinutes {
                Text(minutesLabel(sleep)).font(.system(size: 26, weight: .bold, design: .rounded))
                Text("slept last night").font(.system(size: 11)).foregroundStyle(.secondary)
            } else if let recovery = health.recoveryScore {
                Text("\(recovery)").font(.system(size: 26, weight: .bold, design: .rounded))
                Text("recovery score").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if let recovery = health.recoveryScore {
                HStack(spacing: 5) {
                    Circle().fill(NoraColor.forBucket(recovery >= 60 ? "stable" : "mild")).frame(width: 6, height: 6)
                    Text("Recovery \(recovery)").font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .noraContainerBackground()
    }
}

private struct HealthMediumView: View {
    let health: WidgetHealth

    var body: some View {
        HStack(spacing: 0) {
            statColumn(
                icon: "bed.double.fill",
                value: health.sleepLastNightMinutes.map(minutesLabel) ?? "—",
                caption: "Sleep",
                sub: sleepBaselineNote
            )
            Spacer()
            statColumn(
                icon: "waveform.path.ecg",
                value: health.recoveryScore.map { "\($0)" } ?? "—",
                caption: "Recovery",
                sub: nil
            )
            Spacer()
            statColumn(
                icon: "figure.walk",
                value: health.stepsToday.map { $0.formatted() } ?? "—",
                caption: "Steps",
                sub: stepsBaselineNote
            )
        }
        .padding(14)
        .noraContainerBackground()
    }

    private var sleepBaselineNote: String? {
        guard let last = health.sleepLastNightMinutes, let baseline = health.sleepBaselineMinutes else { return nil }
        return last < baseline - 30 ? "below normal" : last > baseline + 30 ? "above normal" : "on par"
    }
    private var stepsBaselineNote: String? {
        guard let today = health.stepsToday, let baseline = health.stepsBaseline, baseline > 0 else { return nil }
        return today >= baseline ? "on pace" : "\(Int((Double(today) / Double(baseline)) * 100))% of usual"
    }

    private func statColumn(icon: String, value: String, caption: String, sub: String?) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 13)).foregroundStyle(NoraColor.accent)
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded))
            Text(caption).font(.system(size: 11)).foregroundStyle(.secondary)
            if let sub { Text(sub).font(.system(size: 9.5)).foregroundStyle(.tertiary) }
        }
        .frame(maxWidth: .infinity)
    }
}

struct NoraHealthWidget: Widget {
    let kind = "NoraHealthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NoraProvider()) { entry in
            NoraHealthEntryView(health: entry.data.health)
                .widgetURL(URL(string: "nora://status"))
        }
        .configurationDisplayName("Nora · Health")
        .description("Sleep, recovery, and activity from Apple Health.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct NoraHealthEntryView: View {
    let health: WidgetHealth?
    @Environment(\.widgetFamily) var family

    var body: some View {
        guard let health else { return AnyView(HealthConnectPromptView()) }
        switch family {
        case .systemMedium: return AnyView(HealthMediumView(health: health))
        default:            return AnyView(HealthSmallView(health: health))
        }
    }
}
