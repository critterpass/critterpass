import Foundation

/// Orders a spoken reply's audio chunks. The server numbers each turn's chunks from 0; chunks can
/// arrive out of order or twice, and a cancelled or replaced turn's late chunks must stay silent.
/// `push` returns the chunks that are now ready to play, in order. Same rules as ChunkQueue.kt.
public struct ChunkQueue<Item: Sendable>: Sendable {
  public private(set) var turn: String?
  private var nextSeq = 0
  private var pending: [Int: Item] = [:]
  /// Turns that were cancelled or replaced, newest last; bounded so a long session stays small.
  private var retired: [String] = []
  private static var retiredLimit: Int { 32 }

  public init() {}

  /// True when no chunk waits for an earlier one.
  public var isEmpty: Bool { pending.isEmpty }

  public mutating func push(turn: String, seq: Int, item: Item) -> [Item] {
    if retired.contains(turn) || seq < 0 { return [] }
    if turn != self.turn {
      if let current = self.turn { retire(current) }
      self.turn = turn
      nextSeq = 0
      pending.removeAll()
    }
    if seq < nextSeq || pending[seq] != nil { return [] }
    pending[seq] = item
    var ready: [Item] = []
    while let next = pending.removeValue(forKey: nextSeq) {
      ready.append(next)
      nextSeq += 1
    }
    return ready
  }

  /// Stops the current turn: its waiting chunks are dropped and later ones ignored.
  public mutating func cancel() {
    if let current = turn { retire(current) }
    turn = nil
    nextSeq = 0
    pending.removeAll()
  }

  private mutating func retire(_ turn: String) {
    retired.append(turn)
    if retired.count > Self.retiredLimit { retired.removeFirst(retired.count - Self.retiredLimit) }
  }
}
