import SwiftUI
import WidgetKit

/// Every widget and Live Activity the extension draws. Live Activities live under
/// LiveActivities/ (one per kind), home and lock screen widgets under Widgets/.
@main
struct CPWidgetBundle: WidgetBundle {
    var body: some Widget {
        LeaveByLiveActivityWidget()
        FlightLiveActivityWidget()
        LeaveByAlarmCountdownWidget()
        MeetUpLiveActivityWidget()
        CritterNearbyLiveActivityWidget()
        VoteLiveActivityWidget()
        StormLiveActivityWidget()
        SOSLiveActivityWidget()
        RideLiveActivityWidget()
        CountdownWidget()
        VoteWidget()
        CritterdexWidget()
        TodayWidget()
        BalancesWidget()
        CrewWidget()
        NextFlightWidget()
        NextLeaveByWidget()
        SleepyClockWidget()
        ImUpControl()
        SOSControl()
    }
}
