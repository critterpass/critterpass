package app.critterpass.calendar

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class BusyDayReducerTest {
  private val tokyo = ZoneId.of("Asia/Tokyo")
  private val berlin = ZoneId.of("Europe/Berlin")

  private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

  private fun block(start: String, end: String, kind: BlockKind = BlockKind.BUSY, allDay: Boolean = false) =
    BusyBlock(ms(start), ms(end), kind, allDay)

  private fun states(
    blocks: List<BusyBlock>,
    from: String,
    to: String,
    zone: ZoneId = tokyo,
    tentative: Boolean = false,
  ) = BusyDayReducer.reduce(blocks, from, to, zone, tentative).map { it.state }

  @Test
  fun `three waking hours make a day busy`() {
    assertEquals(listOf("busy"), states(listOf(block("2027-04-02T00:00:00Z", "2027-04-02T03:00:00Z")), "2027-04-02", "2027-04-02"))
    assertEquals(listOf("free"), states(listOf(block("2027-04-02T00:00:00Z", "2027-04-02T02:59:00Z")), "2027-04-02", "2027-04-02"))
  }

  @Test
  fun `only waking hours count`() {
    assertEquals(
      listOf("free", "free"),
      states(listOf(block("2027-04-02T13:00:00Z", "2027-04-02T23:00:00Z")), "2027-04-02", "2027-04-03"),
    )
  }

  @Test
  fun `an all-day instance stored at UTC midnight covers the member's own date`() {
    val allDay = BusyDayReducer.allDayBlock(ms("2027-04-02T00:00:00Z"), ms("2027-04-03T00:00:00Z"), BlockKind.BUSY, tokyo)
    assertEquals(listOf("free", "busy", "free"), states(listOf(allDay), "2027-04-01", "2027-04-03"))
  }

  @Test
  fun `tentative is maybe only when shared and never outranks busy`() {
    val maybe = block("2027-04-02T00:00:00Z", "2027-04-02T05:00:00Z", BlockKind.TENTATIVE)
    assertEquals(listOf("free"), states(listOf(maybe), "2027-04-02", "2027-04-02"))
    assertEquals(listOf("maybe"), states(listOf(maybe), "2027-04-02", "2027-04-02", tentative = true))
    val busy = block("2027-04-02T05:00:00Z", "2027-04-02T09:00:00Z")
    assertEquals(listOf("busy"), states(listOf(maybe, busy), "2027-04-02", "2027-04-02", tentative = true))
  }

  @Test
  fun `a multi-day span marks each covered day`() {
    val trip = block("2027-04-02T01:00:00Z", "2027-04-04T03:00:00Z")
    assertEquals(listOf("free", "busy", "busy", "busy", "free"), states(listOf(trip), "2027-04-01", "2027-04-05"))
  }

  @Test
  fun `dates stay the member's own across daylight saving`() {
    val block = block("2027-03-28T06:00:00Z", "2027-03-28T10:00:00Z")
    assertEquals(listOf("free", "busy", "free"), states(listOf(block), "2027-03-27", "2027-03-29", berlin))
  }

  @Test
  fun `only the date and state leave`() {
    val out = BusyDayReducer.reduce(
      listOf(block("2027-04-02T00:00:00Z", "2027-04-02T04:00:00Z")), "2027-04-02", "2027-04-02", tokyo, true,
    )
    assertEquals(listOf(mapOf("date" to "2027-04-02", "state" to "busy")), out.map { it.toMap() })
  }

  @Test
  fun `an unreadable or reversed range is nothing`() {
    assertEquals(emptyList<String>(), states(emptyList(), "2027-04-03", "2027-04-02"))
    assertEquals(emptyList<String>(), states(emptyList(), "bad", "2027-04-02"))
  }
}
