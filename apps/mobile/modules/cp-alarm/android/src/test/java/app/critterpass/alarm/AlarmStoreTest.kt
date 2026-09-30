package app.critterpass.alarm

import app.critterpass.appgroup.AppGroupStore
import app.critterpass.appgroup.PendingActionScope
import app.critterpass.appgroup.PendingActionVia
import app.critterpass.appgroup.PendingActionsFile
import java.io.File
import java.nio.file.Files
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmStoreTest {
  private val root: File = Files.createTempDirectory("cp-alarm").toFile()
  private val appGroup = AppGroupStore(root)
  private val now = AlarmRequest.parseMillis("2026-10-02T19:00:07Z")

  @After
  fun cleanUp() {
    root.deleteRecursively()
  }

  @Test
  fun `keeps one alarm per leave-by and survives a round trip`() {
    val store = AlarmStore(appGroup) { now }
    val request = AlarmPlanTest.request()
    store.save(StoredAlarm(request, "1", AlarmEngine.EXACT, "scheduled"))
    store.save(StoredAlarm(request.snoozed(now), "1", AlarmEngine.INEXACT, "snoozed"))

    val all = AlarmStore(appGroup).all()
    assertEquals(1, all.size)
    assertEquals(AlarmEngine.INEXACT, all[0].engine)
    assertEquals(1, all[0].request.snoozeCount)
    assertEquals("snoozed", all[0].toWire()["state"])
    assertEquals(request.leaveById, store.remove(request.leaveById.uppercase())?.leaveById)
    assertNull(store.get(request.leaveById))
  }

  @Test
  fun `i'm up queues set_readiness from the alarm in the outbox`() {
    val outcome = AlarmPlan.up(AlarmPlanTest.request())
    val action = AlarmOutbox.record(appGroup, outcome, AlarmPlanTest.request().leaveById, now)

    val queued = PendingActionsFile.fromJson(JSONObject(appGroup.pendingActionsText())).actions
    assertEquals(listOf(action.opId), queued.map { it.opId })
    val entry = queued.single()
    assertEquals("set_readiness", entry.cmd)
    assertEquals(PendingActionVia.NOTIF_ACTION, entry.via)
    assertEquals(PendingActionScope.READINESS, entry.scope)
    assertEquals("2026-10-02T19:00:07Z", entry.clientTs)
    assertEquals(
      mapOf("leave_by_id" to AlarmPlanTest.request().leaveById, "state" to "up", "source" to "alarm"),
      entry.payload,
    )
  }

  @Test
  fun `a snooze queues snooze_leave_by with the device count`() {
    val outcome = AlarmPlan.snooze(AlarmPlanTest.request(), now)
    AlarmOutbox.record(appGroup, outcome, AlarmPlanTest.request().leaveById, now)

    val entry = PendingActionsFile.fromJson(JSONObject(appGroup.pendingActionsText())).actions.single()
    assertEquals("snooze_leave_by", entry.cmd)
    assertEquals(PendingActionScope.TRIP_DAY, entry.scope)
    assertEquals(1, entry.payload["count"])
  }

  @Test
  fun `op ids are version 7 and time ordered`() {
    val first = AlarmOutbox.uuidV7(1_790_000_000_000)
    val second = AlarmOutbox.uuidV7(1_790_000_001_000)
    val v7 = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    assertTrue(v7.matches(first) && v7.matches(second))
    assertTrue(first < second)
  }
}
