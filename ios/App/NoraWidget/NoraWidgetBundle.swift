import WidgetKit
import SwiftUI

@main
struct NoraWidgetBundle: WidgetBundle {
    var body: some Widget {
        NoraScheduleWidget()    // small / medium / large / accessory — schedule, next task, progress
        NoraWellbeingWidget()   // medium / large — Recovery, Mental Battery, Momentum, Deep Work Capacity
        NoraHealthWidget()      // small / medium — sleep, recovery, activity (only with Health connected)
        NoraInsightWidget()     // small / medium — Atlas's AI-generated insight
        NoraJourneyWidget()     // small / medium / accessory — current Guided Journey
    }
}
