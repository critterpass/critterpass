// Source file (copied verbatim into generated/swift/ alongside the generated CPTokens.swift by
// codegen/index.ts): registers the bundled font files with Core Text for extension targets, which
// never go through Expo's `expo-font` runtime registration (docs/code-standards.md §14 "No JS in
// extensions"), and adds a `Font.cp(_:)` helper so SwiftUI views can use a `CPTypography` value
// directly.
import SwiftUI

/// Every font file bundled at apps/mobile/assets/fonts/<value>.ttf (tools/scripts/fonts/build-fonts.py's
/// output); keep this in sync with that directory when the font set changes.
private let cpBundledFontFileNames: [String] = [
    "Archivo-W62-700", "Archivo-W62-800", "Archivo-W62-900",
    "Archivo-W66-700", "Archivo-W66-800", "Archivo-W66-900",
    "Archivo-W70-700", "Archivo-W70-800", "Archivo-W70-900",
    "Archivo-W78-700", "Archivo-W78-800", "Archivo-W78-900",
    "Archivo-W100-700", "Archivo-W100-800", "Archivo-W100-900",
    "Geist-400", "Geist-500", "Geist-600", "Geist-700", "Geist-800",
    "GeistMono-400", "GeistMono-500", "GeistMono-700",
    "Mynerve-400",
    "NotoSansThai-400", "NotoSansThai-900",
]

/// Marker type only used to locate this module's resource bundle from `Bundle(for:)`.
private final class CPFontBundleToken {}

public enum CPFont {
    private static var didRegister = false

    /// Registers every bundled `.ttf` with Core Text for the current process. Idempotent and cheap
    /// to call again; extensions and the host app each need their own call since font registration
    /// does not cross process boundaries.
    public static func register() {
        guard !didRegister else { return }
        didRegister = true

        let bundle = Bundle(for: CPFontBundleToken.self)
        for fileName in cpBundledFontFileNames {
            guard let url = bundle.url(forResource: fileName, withExtension: "ttf") else {
                assertionFailure("CPFont: missing bundled font \(fileName).ttf")
                continue
            }
            var registrationError: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &registrationError) {
                assertionFailure("CPFont: failed to register \(fileName): \(String(describing: registrationError))")
            }
        }
    }
}

public extension Font {
    /// Builds a SwiftUI `Font` from a generated `CPTypography` value (see CPTokens.swift), e.g.
    /// `Text("BOOSTED").font(.cp(CPTokens.Typography.h1))`.
    static func cp(_ typography: CPTypography) -> Font {
        .custom(typography.fontFamily, size: typography.fontSize)
    }
}
