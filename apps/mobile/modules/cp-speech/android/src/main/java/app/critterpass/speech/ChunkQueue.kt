package app.critterpass.speech

/**
 * Orders a spoken reply's audio chunks. The server numbers each turn's chunks from 0; chunks can
 * arrive out of order or twice, and a cancelled or replaced turn's late chunks must stay silent.
 * [push] returns the chunks that are now ready to play, in order. Same rules as ChunkQueue.swift.
 */
class ChunkQueue<T> {
  var turn: String? = null
    private set

  private var nextSeq = 0
  private val pending = HashMap<Int, T>()
  /** Turns that were cancelled or replaced, newest last; bounded so a long session stays small. */
  private val retired = ArrayDeque<String>()

  val isEmpty: Boolean
    get() = pending.isEmpty()

  fun push(turn: String, seq: Int, item: T): List<T> {
    if (seq < 0 || retired.contains(turn)) return emptyList()
    if (turn != this.turn) {
      this.turn?.let { retire(it) }
      this.turn = turn
      nextSeq = 0
      pending.clear()
    }
    if (seq < nextSeq || pending.containsKey(seq)) return emptyList()
    pending[seq] = item
    val ready = ArrayList<T>()
    while (true) {
      val next = pending.remove(nextSeq) ?: break
      ready.add(next)
      nextSeq++
    }
    return ready
  }

  /** Stops the current turn: its waiting chunks are dropped and later ones ignored. */
  fun cancel() {
    turn?.let { retire(it) }
    turn = null
    nextSeq = 0
    pending.clear()
  }

  private fun retire(turn: String) {
    retired.addLast(turn)
    while (retired.size > RETIRED_LIMIT) retired.removeFirst()
  }

  private companion object {
    const val RETIRED_LIMIT = 32
  }
}
