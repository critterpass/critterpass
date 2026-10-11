import SwiftUI

/// The evening roundup on long-press (6.36): the guide's title and line, then up to five rows,
/// each an icon on a white tile with its title and a short line. The collapsed notification keeps
/// the one-line summary; iOS draws no rows there.
struct RoundupPosterView: View {
    let title: String
    let subtitle: String?
    let lines: [PosterContent.RoundupLine]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(PosterArt.idle(slug: nil))
                    .resizable()
                    .scaledToFit()
                    .padding(2)
                    .frame(width: 34, height: 34)
                    .background(PosterPalette.guideBg, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14.5, weight: .bold))
                        .foregroundStyle(PosterPalette.ink)
                        .lineLimit(1)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 13))
                            .foregroundStyle(PosterPalette.secondary)
                            .lineLimit(1)
                    }
                }
            }
            ForEach(Array(lines.prefix(5).enumerated()), id: \.offset) { _, line in
                HStack(spacing: 10) {
                    Image(systemName: Self.symbol(line.kind))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PosterPalette.ink)
                        .frame(width: 30, height: 30)
                        .background(PosterPalette.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(line.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(PosterPalette.ink)
                            .lineLimit(1)
                        if let sub = line.sub, !sub.isEmpty {
                            Text(sub)
                                .font(.system(size: 12))
                                .foregroundStyle(PosterPalette.muted)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    /// The row's icon from the rolled-up notification's key.
    static func symbol(_ kind: String) -> String {
        let pairs: [(String, String)] = [
            ("booking", "ticket"), ("flight", "airplane"), ("vote", "checkmark.seal"),
            ("poll", "checkmark.seal"), ("expense", "creditcard"), ("settle", "creditcard"),
            ("money", "creditcard"), ("payment", "creditcard"), ("critter", "pawprint"),
            ("quest", "flag"), ("invite", "person.2"), ("crew", "person.2"), ("chat", "bubble.left"),
            ("weather", "cloud.sun"), ("plan", "calendar"), ("change", "calendar"),
        ]
        return pairs.first { kind.contains($0.0) }?.1 ?? "sparkles"
    }
}
