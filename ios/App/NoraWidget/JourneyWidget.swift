import WidgetKit
import SwiftUI

private struct NoJourneyView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "map")
                .font(.system(size: 22))
                .foregroundStyle(NoraColor.accent)
            Text("No active Journey")
                .font(.system(size: 12, weight: .semibold))
            Text("Ask Atlas to start one")
                .font(.system(size: 10.5))
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .noraContainerBackground()
    }
}

private struct JourneySmallView: View {
    let journey: WidgetJourney

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: journey.domain, icon: "map.fill")
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                ZStack {
                    Circle().stroke(NoraColor.accent.opacity(0.18), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: Double(journey.progress) / 100.0)
                        .stroke(NoraColor.accent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(journey.progress)%").font(.system(size: 13, weight: .bold, design: .rounded))
                }
                .frame(width: 46, height: 46)
                VStack(alignment: .leading, spacing: 1) {
                    Text(journey.title).font(.system(size: 13, weight: .bold)).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if let next = journey.nextMilestone {
                Text(next.title).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(14)
        .noraContainerBackground()
    }
}

private struct JourneyMediumView: View {
    let journey: WidgetJourney

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().stroke(NoraColor.accent.opacity(0.18), lineWidth: 7)
                Circle()
                    .trim(from: 0, to: Double(journey.progress) / 100.0)
                    .stroke(NoraColor.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(journey.progress)%").font(.system(size: 17, weight: .bold, design: .rounded))
            }
            .frame(width: 64, height: 64)

            VStack(alignment: .leading, spacing: 4) {
                Text(journey.title).font(.system(size: 16, weight: .bold)).lineLimit(1)
                if !journey.milestones.isEmpty {
                    Text("Milestone \(min(journey.milestonesDoneCount + 1, journey.milestones.count)) of \(journey.milestones.count)")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                }
                if let next = journey.nextMilestone {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("TODAY'S GOAL").font(.system(size: 8.5, weight: .semibold)).foregroundStyle(.tertiary).kerning(0.3)
                        Text(next.title).font(.system(size: 12, weight: .medium)).lineLimit(2)
                    }
                    .padding(.top, 2)
                } else {
                    Text("All milestones complete").font(.system(size: 12, weight: .medium)).foregroundStyle(NoraColor.green)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .noraContainerBackground()
    }
}

private struct JourneyAccessoryCircularView: View {
    let journey: WidgetJourney
    var body: some View {
        Gauge(value: Double(journey.progress), in: 0...100) {
            Image(systemName: "map.fill")
        } currentValueLabel: {
            Text("\(journey.progress)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .noraContainerBackground()
    }
}

private struct JourneyAccessoryRectangularView: View {
    let journey: WidgetJourney
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(journey.title).font(.headline).lineLimit(1)
            if let next = journey.nextMilestone {
                Text(next.title).font(.caption).lineLimit(1)
            }
        }
        .widgetAccentable()
        .noraContainerBackground()
    }
}

struct NoraJourneyWidget: Widget {
    let kind = "NoraJourneyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NoraProvider()) { entry in
            NoraJourneyEntryView(journey: entry.data.journey)
                .widgetURL(URL(string: "nora://journey"))
        }
        .configurationDisplayName("Nora · Guided Journey")
        .description("Your current long-term goal, milestone, and progress.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

private struct NoraJourneyEntryView: View {
    let journey: WidgetJourney?
    @Environment(\.widgetFamily) var family

    var body: some View {
        guard let journey else {
            if family == .accessoryCircular || family == .accessoryRectangular {
                return AnyView(EmptyView().noraContainerBackground())
            }
            return AnyView(NoJourneyView())
        }
        switch family {
        case .systemMedium:         return AnyView(JourneyMediumView(journey: journey))
        case .accessoryCircular:    return AnyView(JourneyAccessoryCircularView(journey: journey))
        case .accessoryRectangular: return AnyView(JourneyAccessoryRectangularView(journey: journey))
        default:                   return AnyView(JourneySmallView(journey: journey))
        }
    }
}
