import Foundation

// What the home widgets (5c-1) show for a snapshot, kept free of SwiftUI and WidgetKit so the host
// tests (targets/Package.swift) run it.

/// The countdown widget: days to go, the trip's day, or nothing to count.
enum CountdownFace: Equatable {
    /// "BALI IN 17 DAYS" (one day reads "TOMORROW").
    case daysTo(place: String?, days: Int)
    /// On the trip: "DAY 4".
    case onTrip(place: String?, day: Int)
    /// Past the last day, or no trip at all.
    case noTrip
}

enum CountdownModel {
    /// The face at `now`, counting calendar days in the trip's zone (the device's when unknown).
    static func face(
        snapshot: WidgetSnapshot, now: Date, deviceZone: TimeZone = .current
    ) -> CountdownFace {
        guard let trip = snapshot.trip else { return .noTrip }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = trip.tz.flatMap(TimeZone.init(identifier:)) ?? deviceZone
        let today = calendar.startOfDay(for: now)
        if let start = localDate(trip.startDate, calendar), let end = localDate(trip.endDate, calendar),
           today >= start
        {
            guard today <= end else { return .noTrip }
            let day = (calendar.dateComponents([.day], from: start, to: today).day ?? 0) + 1
            return .onTrip(place: trip.destination, day: day)
        }
        let target =
            WidgetDate.parse(snapshot.countdown?.targetAt) ?? localDate(trip.startDate, calendar)
        guard let target else { return .noTrip }
        let days = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: target)).day ?? 0
        if days <= 0 { return .onTrip(place: trip.destination, day: 1) }
        return .daysTo(place: trip.destination, days: days)
    }

    /// The next few local midnights, where the face changes (one timeline entry each).
    static func midnights(after now: Date, count: Int, zone: TimeZone) -> [Date] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        var next = calendar.startOfDay(for: now)
        return (0..<max(0, count)).compactMap { _ in
            guard let day = calendar.date(byAdding: .day, value: 1, to: next) else { return nil }
            next = day
            return day
        }
    }

    private static func localDate(_ text: String?, _ calendar: Calendar) -> Date? {
        guard let text else { return nil }
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

/// The vote widget: the two sides of the showdown, the counts, and the result once it closes.
struct VoteFace: Equatable {
    struct Side: Equatable {
        let optionId: String
        let label: String
        let votes: Int
        let mine: Bool
        let winner: Bool
    }

    let pollId: String
    let left: Side
    let right: Side
    /// Options beyond the two shown.
    let more: Int
    let closed: Bool
    let closesAt: Date?

    /// The two options with the most votes (ties in the poll's order); nil without a vote of two.
    /// A tap already made on this phone counts at once (`pending`), until the snapshot has it.
    static func make(vote: WSVote?, pending optionId: String? = nil) -> VoteFace? {
        guard let vote, vote.options.count >= 2 else { return nil }
        let mine = vote.myOptionId ?? optionId
        let counted = vote.options.map { option -> WSOption in
            var option = option
            if vote.myOptionId == nil, option.id == optionId { option.votes += 1 }
            return option
        }
        let ranked = counted.enumerated()
            .sorted { $0.element.votes != $1.element.votes ? $0.element.votes > $1.element.votes : $0.offset < $1.offset }
            .prefix(2)
            .sorted { $0.offset < $1.offset }
            .map(\.element)
        let closed = vote.status == "closed"
        func side(_ option: WSOption) -> Side {
            Side(
                optionId: option.id, label: option.label, votes: option.votes,
                mine: option.id == mine, winner: closed && option.id == vote.winnerOptionId)
        }
        return VoteFace(
            pollId: vote.pollId, left: side(ranked[0]), right: side(ranked[1]),
            more: vote.options.count - 2, closed: closed, closesAt: WidgetDate.parse(vote.closesAt))
    }
}

/// The Critterdex widget: "9/150" and how full the book is.
enum CritterdexModel {
    static func fraction(found: Int, total: Int) -> Double {
        total > 0 ? min(1, Double(max(0, found)) / Double(total)) : 0
    }
}
