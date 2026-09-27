package app.critterpass.spikeandroid.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class AndroidSurfacesPushPayloadTest {
  private fun payload(
    type: String = "la.leaveby",
    op: String = "start",
    state: String = """{"progress":1,"progressMax":4,"chip":"12 min"}""",
  ) = mapOf("type" to type, "op" to op, "state" to state)

  @Test
  fun `parses a start payload without a metric`() {
    val result = AndroidSurfacesPushPayloadParser.parse(payload())

    assertEquals("leaveby", result.kind)
    assertEquals(PushOp.START, result.op)
    assertEquals(1, result.progress)
    assertEquals(4, result.progressMax)
    assertEquals("12 min", result.chip)
    assertNull(result.metricLabel)
    assertNull(result.metricValue)
  }

  @Test
  fun `parses update and end ops`() {
    assertEquals(PushOp.UPDATE, AndroidSurfacesPushPayloadParser.parse(payload(op = "update")).op)
    assertEquals(PushOp.END, AndroidSurfacesPushPayloadParser.parse(payload(op = "end")).op)
  }

  @Test
  fun `parses an optional metric label and value`() {
    val state = """{"progress":2,"progressMax":4,"chip":"8 min","metricLabel":"ETA","metricValue":8.5}"""
    val result = AndroidSurfacesPushPayloadParser.parse(payload(state = state))

    assertEquals("ETA", result.metricLabel)
    assertEquals(8.5f, result.metricValue)
  }

  @Test
  fun `rejects a type outside the la namespace`() {
    assertThrows(InvalidPushPayloadException::class.java) {
      AndroidSurfacesPushPayloadParser.parse(payload(type = "widget.refresh"))
    }
  }

  @Test
  fun `rejects a missing op`() {
    assertThrows(InvalidPushPayloadException::class.java) {
      AndroidSurfacesPushPayloadParser.parse(mapOf("type" to "la.leaveby", "state" to "{}"))
    }
  }

  @Test
  fun `rejects state missing required fields`() {
    assertThrows(InvalidPushPayloadException::class.java) {
      AndroidSurfacesPushPayloadParser.parse(payload(state = """{"progress":1}"""))
    }
  }

  @Test
  fun `rejects state that is not valid json`() {
    assertThrows(InvalidPushPayloadException::class.java) {
      AndroidSurfacesPushPayloadParser.parse(payload(state = "not json"))
    }
  }
}
