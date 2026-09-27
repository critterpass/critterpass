// Measures the atomic write-then-read cycle `CpAppGroupModule`'s `AppGroupFiles` helper performs
// (temp file write + rename, then a full read back), against a plain temp directory instead of a
// real App Group container: a command-line `swift` script has no entitlements, so it cannot open
// `group.app.critterpass`. This isolates the filesystem-I/O floor of the round trip; the
// JSI call itself and the real sandboxed container add a small, separately-measured amount on
// top (see the ADR's device/simulator numbers for the full path).
//
// Run: swift tools/spikes/cp-app-group/measure-file-roundtrip.swift
import Foundation

func writeAtomic(_ data: Data, to fileUrl: URL) throws {
    try FileManager.default.createDirectory(at: fileUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
    let tempUrl = fileUrl.appendingPathExtension("tmp-\(UUID().uuidString)")
    try data.write(to: tempUrl, options: .atomic)
    _ = try FileManager.default.replaceItemAt(fileUrl, withItemAt: tempUrl)
}

let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("cp-app-group-spike-\(UUID().uuidString)")
let fileUrl = tempDir.appendingPathComponent("snapshot/hello.json")
defer { try? FileManager.default.removeItem(at: tempDir) }

let iterations = 200
var writeDurationsMs: [Double] = []
var readDurationsMs: [Double] = []

for i in 0..<iterations {
    let payload = #"{"schema":1,"generated_at":"\#(ISO8601DateFormatter().string(from: Date()))","message":"hello \#(i)"}"#
    let data = Data(payload.utf8)

    let writeStart = DispatchTime.now()
    try! writeAtomic(data, to: fileUrl)
    let writeEnd = DispatchTime.now()
    writeDurationsMs.append(Double(writeEnd.uptimeNanoseconds - writeStart.uptimeNanoseconds) / 1_000_000)

    let readStart = DispatchTime.now()
    _ = try! String(contentsOf: fileUrl, encoding: .utf8)
    let readEnd = DispatchTime.now()
    readDurationsMs.append(Double(readEnd.uptimeNanoseconds - readStart.uptimeNanoseconds) / 1_000_000)
}

func percentile(_ values: [Double], _ p: Double) -> Double {
    let sorted = values.sorted()
    let index = min(sorted.count - 1, Int(Double(sorted.count) * p))
    return sorted[index]
}

func summarize(_ label: String, _ values: [Double]) {
    let p50 = percentile(values, 0.50)
    let p95 = percentile(values, 0.95)
    let max = values.max() ?? 0
    print("\(label): p50=\(String(format: "%.3f", p50))ms p95=\(String(format: "%.3f", p95))ms max=\(String(format: "%.3f", max))ms (n=\(values.count))")
}

summarize("write (atomic temp+rename)", writeDurationsMs)
summarize("read (full file)", readDurationsMs)
summarize("write+read combined", zip(writeDurationsMs, readDurationsMs).map(+))
