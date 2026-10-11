import SwiftUI
import UIKit

/// A member's face when they have no photo (6.33): their initial in the on-accent ink, bold, on
/// their crew colour, drawn at 3x of the 38 pt avatar.
enum InitialAvatar {
    static let side: CGFloat = 114

    static func png(name: String, tone: String?) -> Data? {
        guard let initial = name.trimmingCharacters(in: .whitespacesAndNewlines).first else {
            return nil
        }
        let fill = UIColor(colour(tone))
        let ink = UIColor(CPPremium.light.colorOnAccent)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
        let image = renderer.image { context in
            fill.setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: side, height: side))
            let text = String(initial).uppercased() as NSString
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: side * 0.45, weight: .bold),
                .foregroundColor: ink,
            ]
            let size = text.size(withAttributes: attributes)
            text.draw(
                at: CGPoint(x: (side - size.width) / 2, y: (side - size.height) / 2),
                withAttributes: attributes)
        }
        return image.pngData()
    }

    /// The crew colour by its payload name; sun when the push carries none.
    static func colour(_ tone: String?) -> Color {
        switch tone {
        case "orange": return CPPremium.Accent.tangerine
        case "blue": return CPPremium.Accent.sky
        case "pink": return CPPremium.Accent.pink
        case "green": return CPPremium.Accent.mint
        case "cream": return CPPremium.Accent.neutral
        default: return CPPremium.Accent.sun
        }
    }
}
