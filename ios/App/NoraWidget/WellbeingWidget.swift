import WidgetKit
import SwiftUI

// ─── Medium (4×2): the 4 AI-computed status metrics at a glance ─────────

private struct WellbeingMediumView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(NoraColor.accent)
                Text("Nora · Today").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                Spacer()
                if let streak = data.metrics?.consistencyStreakDays, streak > 0 {
                    Label("\(streak)d", systemImage: "flame.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(NoraColor.orange)
                }
            }

            HStack(spacing: 0) {
                MetricDialView(metric: data.metrics?.recoveryIndex, label: "Recovery")
                Spacer()
                MetricDialView(metric: data.metrics?.mentalBattery, label: "Battery")
                Spacer()
                MetricDialView(metric: data.metrics?.momentum, label: "Momentum")
                Spacer()
                MetricDialView(metric: data.metrics?.deepWorkCapacity, label: "Deep Work")
            }
        }
        .padding(14)
        .noraContainerBackground()
    }
}

// ─── Large (4×4): the 4 metrics + a 7-day completion trend ───────────────

private struct WellbeingLargeView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "sparkles").font(.system(size: 13)).foregroundStyle(NoraColor.accent)
                Text("Nora · Wellbeing").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
                Spacer()
                if let streak = data.metrics?.consistencyStreakDays, streak > 0 {
                    Label("\(streak)-day streak", systemImage: "flame.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(NoraColor.orange)
                }
            }

            HStack(spacing: 0) {
                MetricDialView(metric: data.metrics?.recoveryIndex, label: "Recovery", ringSize: 62)
                Spacer()
                MetricDialView(metric: data.metrics?.mentalBattery, label: "Battery", ringSize: 62)
                Spacer()
                MetricDialView(metric: data.metrics?.momentum, label: "Momentum", ringSize: 62)
                Spacer()
                MetricDialView(metric: data.metrics?.deepWorkCapacity, label: "Deep Work", ringSize: 62)
            }

            Divider1px()

            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "This week", icon: "chart.line.uptrend.xyaxis")
                WeeklyTrendBars(values: data.weeklyCompletionPct ?? [])
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .noraContainerBackground()
    }
}

private struct WeeklyTrendBars: View {
    let values: [Int]
    private let days = ["S", "M", "T", "W", "T", "F", "S"]

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(Array(values.enumerated()), id: \.offset) { index, pct in
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(index == values.count - 1 ? NoraColor.accent : NoraColor.accent.opacity(0.35))
                        .frame(height: max(4, CGFloat(pct) * 0.36))
                    Text(index < days.count ? days[index] : "")
                        .font(.system(size: 8.5))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(height: 50, alignment: .bottom)
    }
}

// ─── Widget configuration ─────────────────────────────────────────────────

struct NoraWellbeingWidget: Widget {
    let kind = "NoraWellbeingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NoraProvider()) { entry in
            NoraWellbeingEntryView(data: entry.data)
                .widgetURL(URL(string: "nora://status"))
        }
        .configurationDisplayName("Nora · Wellbeing")
        .description("Recovery, Mental Battery, Momentum, and Deep Work Capacity.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

private struct NoraWellbeingEntryView: View {
    let data: WidgetData
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemLarge: WellbeingLargeView(data: data)
        default:           WellbeingMediumView(data: data)
        }
    }
}
