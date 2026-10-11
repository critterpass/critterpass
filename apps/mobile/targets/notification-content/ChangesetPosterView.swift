import SwiftUI

/// A change that needs the crew's yes (6.34): from the guide, the question and the push's line,
/// the stops that move with their old and new times, then who has said yes so far and when it
/// closes. Yes and no are the notification's own buttons (titled by the poster) and go on to the
/// app, which runs `approve_changeset`.
struct ChangesetPosterView: View {
    let state: PosterState
    let change: PosterContent.Change

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PosterHeader(
                title: String(localized: "Tokek · a change"), art: PosterArt.idle(slug: nil),
                tint: PosterPalette.yellow, size: 20, deliveredAt: state.deliveredAt)
            VStack(alignment: .leading, spacing: 4) {
                Text(state.content?.title ?? "")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundStyle(PosterPalette.ink)
                    .lineLimit(2)
                if let body = state.content?.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 14))
                        .foregroundStyle(PosterPalette.secondary)
                        .lineLimit(3)
                }
            }
            if !change.rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(change.rows.enumerated()), id: \.offset) { _, row in
                        ChangesetRow(row: row)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(PosterPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            if let footer {
                HStack(spacing: 8) {
                    if !change.voters.isEmpty { PosterVoterStack(voters: change.voters) }
                    Text(footer)
                        .font(.system(size: 12.5))
                        .foregroundStyle(PosterPalette.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    /// "2 of 3 yeses · closes 18:00".
    private var footer: String? {
        var parts: [String] = []
        if let yes = change.yesCount, let needed = change.needed {
            parts.append(String(localized: "\(yes) of \(needed) yeses"))
        }
        if let closes = change.closesAt, closes > .now {
            let time = Calendar.current.isDateInToday(closes)
                ? closes.formatted(date: .omitted, time: .shortened)
                : closes.formatted(.dateTime.weekday(.abbreviated).hour().minute())
            parts.append(String(localized: "closes \(time)"))
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// One stop: a sky dot, its name, the old time and the new one in bold.
struct ChangesetRow: View {
    let row: PosterContent.Change.Row

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(PosterPalette.blue).frame(width: 6, height: 6)
            Text(row.label)
                .foregroundStyle(PosterPalette.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(verbatim: "\(row.from ?? String(localized: "new")) →")
                .foregroundStyle(PosterPalette.muted)
            Text(verbatim: row.to ?? String(localized: "dropped"))
                .fontWeight(.bold)
                .foregroundStyle(PosterPalette.ink)
        }
        .font(.system(size: 14).monospacedDigit())
    }
}

/// Who said yes, as initials on their crew colours, overlapping.
struct PosterVoterStack: View {
    let voters: [PosterContent.Change.Voter]

    var body: some View {
        HStack(spacing: -8) {
            ForEach(Array(voters.prefix(4).enumerated()), id: \.offset) { _, voter in
                Text(voter.initial)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(PosterPalette.night)
                    .frame(width: 22, height: 22)
                    .background(PosterPalette.tone(voter.tone), in: Circle())
                    .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
            }
        }
        .accessibilityHidden(true)
    }
}
