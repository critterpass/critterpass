package app.critterpass.speech

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChunkQueueTest {
  @Test
  fun releasesChunksInSequenceOrder() {
    val queue = ChunkQueue<String>()
    assertEquals(emptyList<String>(), queue.push("a", 1, "a1"))
    assertEquals(emptyList<String>(), queue.push("a", 2, "a2"))
    assertEquals(listOf("a0", "a1", "a2"), queue.push("a", 0, "a0"))
    assertEquals(listOf("a3"), queue.push("a", 3, "a3"))
    assertTrue(queue.isEmpty)
  }

  @Test
  fun dropsDuplicates() {
    val queue = ChunkQueue<String>()
    assertEquals(listOf("a0"), queue.push("a", 0, "a0"))
    assertEquals(emptyList<String>(), queue.push("a", 0, "again"))
    assertEquals(emptyList<String>(), queue.push("a", 2, "a2"))
    assertEquals(emptyList<String>(), queue.push("a", 2, "again"))
    assertEquals(listOf("a1", "a2"), queue.push("a", 1, "a1"))
  }

  @Test
  fun cancelledTurnStaysSilent() {
    val queue = ChunkQueue<String>()
    assertEquals(listOf("a0"), queue.push("a", 0, "a0"))
    queue.push("a", 2, "a2")
    queue.cancel()
    assertEquals(emptyList<String>(), queue.push("a", 1, "a1"))
    assertEquals(listOf("b0"), queue.push("b", 0, "b0"))
  }

  @Test
  fun newTurnReplacesTheOldOne() {
    val queue = ChunkQueue<String>()
    queue.push("a", 0, "a0")
    assertEquals(listOf("b0"), queue.push("b", 0, "b0"))
    assertEquals(emptyList<String>(), queue.push("a", 1, "a1"))
    assertEquals("b", queue.turn)
  }
}
