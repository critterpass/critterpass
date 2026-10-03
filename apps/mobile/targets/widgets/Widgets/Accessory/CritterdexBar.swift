import SwiftUI
import WidgetKit

/// The Critterdex on the lock screen (5c-3, rectangular): "9 OF 150" and a bar of how full the
/// book is, in the system tint.
struct CritterdexAccessory: View {
    let entry: HomeWidgetEntry

    var body: some View {
        if let dex = entry.file?.snapshot.critterdex {
            VStack(alignment: .leading, spacing: 3) {
                Text("CRITTERDEX")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1)
                Text("\(dex.found) OF \(dex.total)")
                    .font(.system(size: 17, weight: .black).monospacedDigit())
                    .widgetAccentable()
                Gauge(value: CritterdexModel.fraction(found: dex.found, total: dex.total)) {
                    EmptyView()
                }
                .gaugeStyle(.accessoryLinearCapacity)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("Critterdex").font(.system(size: 13, weight: .semibold))
        }
    }
}
