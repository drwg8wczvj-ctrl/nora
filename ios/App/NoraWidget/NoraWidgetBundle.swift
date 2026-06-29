import WidgetKit
import SwiftUI

@main
struct NoraWidgetBundle: WidgetBundle {
    var body: some Widget {
        NoraScheduleWidget()   // small / medium / large — shows task list
        NoraStatsWidget()      // medium only — shows energy / focus / calm rings
    }
}
