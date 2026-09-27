// Prints an X-CP-Sig for a fixed test vector using the exact algorithm in
// apps/mobile/targets/_shared/ActionsClient.swift (duplicated here because a command-line `swift`
// script cannot import that compiled Xcode target). signature-parity.test.ts computes the same
// vector in TypeScript and asserts the two outputs match byte-for-byte, proving the NCE/App
// Intent signer and the actions-server verifier speak the same wire format.
//
// Run: swift tools/spikes/apns-live-activity/print-test-vector-signature.swift
import CryptoKit
import Foundation

let secret = Data("spike-secret-32-bytes-minimum!!!".utf8)
let method = "POST"
let path = "/v1/actions"
let body = Data(#"{"op_id":"fixed-op","command":"cast_ballot","scope":"ballot","payload":{"poll_id":"p1"}}"#.utf8)
let timestamp = 1_700_000_000

let bodyDigest = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
let toSign = "\(method)\n\(path)\n\(timestamp)\n\(bodyDigest)"
let signature = HMAC<SHA256>.authenticationCode(for: Data(toSign.utf8), using: SymmetricKey(data: secret))
let base64url = Data(signature)
    .base64EncodedString()
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")

print(base64url)
