/**
 * Comprehensive Slot Planner Test Suite
 * Tests all aspects of the time slot engine including edge cases
 * 
 * Run with: node tests/slotPlanner.comprehensive.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import {
  computeSlotsForBeautician,
  computeSlotsAnyStaff,
  nextAvailableSlot,
  hhmmToMinutes,
  minutesToHHMM,
  intervalsOverlap,
  mergeOverlaps,
  buildWorkingWindows,
} from "../src/utils/slotPlanner.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Europe/London";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

describe("Helper Functions", () => {
  it("hhmmToMinutes should convert time strings to minutes correctly", () => {
    assert.strictEqual(hhmmToMinutes("00:00"), 0);
    assert.strictEqual(hhmmToMinutes("09:00"), 540);
    assert.strictEqual(hhmmToMinutes("12:30"), 750);
    assert.strictEqual(hhmmToMinutes("23:59"), 1439);
  });

  it("minutesToHHMM should convert minutes to time strings correctly", () => {
    assert.strictEqual(minutesToHHMM(0), "00:00");
    assert.strictEqual(minutesToHHMM(540), "09:00");
    assert.strictEqual(minutesToHHMM(750), "12:30");
    assert.strictEqual(minutesToHHMM(1439), "23:59");
  });

  it("intervalsOverlap should detect overlapping intervals", () => {
    const interval1 = { start: new Date(100), end: new Date(200) };
    const interval2 = { start: new Date(150), end: new Date(250) };
    const interval3 = { start: new Date(300), end: new Date(400) };

    assert.strictEqual(intervalsOverlap(interval1, interval2), true);
    assert.strictEqual(intervalsOverlap(interval1, interval3), false);
  });

  it("mergeOverlaps should merge overlapping date intervals", () => {
    const intervals = [
      { start: new Date("2026-02-10T09:00:00Z"), end: new Date("2026-02-10T10:00:00Z") },
      { start: new Date("2026-02-10T09:30:00Z"), end: new Date("2026-02-10T11:00:00Z") },
      { start: new Date("2026-02-10T14:00:00Z"), end: new Date("2026-02-10T15:00:00Z") },
    ];

    const merged = mergeOverlaps(intervals);
    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged[0].start.toISOString(), "2026-02-10T09:00:00.000Z");
    assert.strictEqual(merged[0].end.toISOString(), "2026-02-10T11:00:00.000Z");
    assert.strictEqual(merged[1].start.toISOString(), "2026-02-10T14:00:00.000Z");
  });

  it("buildWorkingWindows should handle array format working hours", () => {
    const workingHours = [
      { dayOfWeek: 1, start: "09:00", end: "17:00" }, // Monday
      { dayOfWeek: 2, start: "09:00", end: "17:00" }, // Tuesday
    ];

    const monday = buildWorkingWindows(workingHours, "2026-02-09"); // Monday
    assert.ok(monday);
    assert.strictEqual(monday.length, 1);
    assert.strictEqual(monday[0].startMin, 540); // 09:00
    assert.strictEqual(monday[0].endMin, 1020); // 17:00
  });

  it("buildWorkingWindows should return null for non-working days", () => {
    const workingHours = [
      { dayOfWeek: 1, start: "09:00", end: "17:00" }, // Monday only
    ];

    const sunday = buildWorkingWindows(workingHours, "2026-02-08"); // Sunday
    assert.strictEqual(sunday, null);
  });

  it("buildWorkingWindows should handle custom schedule override", () => {
    const workingHours = [
      { dayOfWeek: 1, start: "09:00", end: "17:00" },
    ];
    const customSchedule = {
      "2026-02-09": [{ start: "10:00", end: "14:00" }], // Custom hours for specific date
    };

    const windows = buildWorkingWindows(workingHours, "2026-02-09", {}, customSchedule);
    assert.ok(windows);
    assert.strictEqual(windows[0].startMin, 600); // 10:00
    assert.strictEqual(windows[0].endMin, 840); // 14:00
  });
});

// ============================================================================
// BASIC SLOT GENERATION
// ============================================================================

describe("Basic Slot Generation", () => {
  it("should generate slots within working hours", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }], // Monday
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09", // Monday
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    assert.ok(slots.length > 0);
    // Should have slots from 09:00-17:00 with 60min steps = 8 slots
    assert.strictEqual(slots.length, 8);
  });

  it("should respect step intervals", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
    };

    const service = {
      durationMin: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 15,
      service,
      beautician,
      appointments: [],
    });

    // With 15min steps and 30min service, should have many slots
    assert.ok(slots.length > 8);
    
    // Verify 15-minute increments
    for (let i = 1; i < slots.length; i++) {
      const prev = dayjs(slots[i - 1].startISO);
      const curr = dayjs(slots[i].startISO);
      const diff = curr.diff(prev, "minute");
      assert.strictEqual(diff, 15);
    }
  });

  it("should return empty array for inactive beautician", () => {
    const beautician = {
      _id: "b1",
      active: false,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = { durationMin: 60 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 15,
      service,
      beautician,
      appointments: [],
    });

    assert.strictEqual(slots.length, 0);
  });

  it("should return empty array for non-working days", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }], // Monday only
    };

    const service = { durationMin: 60 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-08", // Sunday
      salonTz: TZ,
      stepMin: 15,
      service,
      beautician,
      appointments: [],
    });

    assert.strictEqual(slots.length, 0);
  });
});

// ============================================================================
// APPOINTMENTS BLOCKING
// ============================================================================

describe("Appointment Blocking", () => {
  it("should exclude slots blocked by appointments", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const appointments = [
      {
        start: "2026-02-09T10:00:00.000Z",
        end: "2026-02-09T11:00:00.000Z",
        status: "confirmed",
      },
    ];

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments,
    });

    // Should not include 10:00-11:00 slot
    const blockedSlot = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "10:00"
    );
    assert.strictEqual(blockedSlot, undefined);
  });

  it("should skip cancelled appointments", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const appointments = [
      {
        start: "2026-02-09T10:00:00.000Z",
        end: "2026-02-09T11:00:00.000Z",
        status: "cancelled_no_refund",
      },
      {
        start: "2026-02-09T11:00:00.000Z",
        end: "2026-02-09T12:00:00.000Z",
        status: "cancelled_full_refund",
      },
    ];

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments,
    });

    // Should include the cancelled slots
    const slot10 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "10:00"
    );
    const slot11 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "11:00"
    );
    
    assert.ok(slot10, "10:00 slot should be available (cancelled appointment)");
    assert.ok(slot11, "11:00 slot should be available (cancelled appointment)");
  });

  it("should handle overlapping appointments correctly", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const appointments = [
      {
        start: "2026-02-09T09:30:00.000Z",
        end: "2026-02-09T10:30:00.000Z",
        status: "confirmed",
      },
    ];

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments,
    });

    // Should not include 09:00 or 10:00 slots (both overlap)
    const slot9 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "09:00"
    );
    const slot10 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "10:00"
    );
    
    assert.strictEqual(slot9, undefined);
    assert.strictEqual(slot10, undefined);
  });
});

// ============================================================================
// BREAKS AND TIME OFF
// ============================================================================

describe("Breaks and Time Off", () => {
  it("should exclude slots during breaks", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [
        { 
          dayOfWeek: 1, 
          start: "09:00", 
          end: "17:00"
        }
      ],
      customSchedule: {
        "2026-02-09": [
          { start: "09:00", end: "12:00" },
          { start: "13:00", end: "17:00" }
        ]
      }
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    // Should not include 12:00 slot (break time between windows)
    const breakSlot = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "12:00"
    );
    assert.strictEqual(breakSlot, undefined, "12:00 slot should be excluded due to break");
    
    // Should have slots before and after break
    const slot11 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "11:00"
    );
    const slot13 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "13:00"
    );
    assert.ok(slot11, "11:00 slot should be available");
    assert.ok(slot13, "13:00 slot should be available");
  });

  it("should exclude slots during time off", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
      timeOff: [
        {
          start: "2026-02-09T14:00:00.000Z",
          end: "2026-02-09T16:00:00.000Z",
        },
      ],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    // Should not include 14:00 or 15:00 slots
    const slot14 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "14:00"
    );
    const slot15 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "15:00"
    );
    
    assert.strictEqual(slot14, undefined);
    assert.strictEqual(slot15, undefined);
  });

  it("should handle multiple breaks in a day", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [
        { 
          dayOfWeek: 1, 
          start: "09:00", 
          end: "17:00"
        }
      ],
      customSchedule: {
        "2026-02-09": [
          { start: "09:00", end: "11:00" },
          { start: "11:30", end: "14:00" },
          { start: "14:30", end: "17:00" }
        ]
      }
    };

    const service = { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 30,
      service,
      beautician,
      appointments: [],
    });

    // Should not include slots during breaks (11:00-11:30 and 14:00-14:30)
    const hasBreakSlot1 = slots.some(s => {
      const time = dayjs(s.startISO).tz(TZ);
      return time.hour() === 11 && time.minute() === 0;
    });
    const hasBreakSlot2 = slots.some(s => {
      const time = dayjs(s.startISO).tz(TZ);
      return time.hour() === 14 && time.minute() === 0;
    });
    
    assert.strictEqual(hasBreakSlot1, false, "11:00 slot should be excluded (break time)");
    assert.strictEqual(hasBreakSlot2, false, "14:00 slot should be excluded (break time)");
    
    // Should have slots before and after breaks
    const slot1030 = slots.some(s => {
      const time = dayjs(s.startISO).tz(TZ);
      return time.hour() === 10 && time.minute() === 30;
    });
    const slot1130 = slots.some(s => {
      const time = dayjs(s.startISO).tz(TZ);
      return time.hour() === 11 && time.minute() === 30;
    });
    
    assert.strictEqual(slot1030, true, "10:30 slot should be available");
    assert.strictEqual(slot1130, true, "11:30 slot should be available");
  });
});

// ============================================================================
// BUFFERS
// ============================================================================

describe("Service Buffers", () => {
  it("should account for buffer times when checking availability", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
    };

    const appointments = [
      {
        start: "2026-02-09T10:00:00.000Z",
        end: "2026-02-09T11:00:00.000Z",
        status: "confirmed",
      },
    ];

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 15,
      service,
      beautician,
      appointments,
    });

    // With buffers, slots near the appointment should be blocked
    // Service + buffers = 90 minutes total
    const slot9 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "09:00"
    );
    
    // 09:00 slot with 90min total would end at 10:30, overlapping with appointment at 10:00
    assert.strictEqual(slot9, undefined, "Slot should be blocked due to buffer overlap");
  });

  it("should not generate slots that exceed working hours with buffers", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
    };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 30,
      service,
      beautician,
      appointments: [],
    });

    // Last slot should end by 17:00 including buffers
    const lastSlot = slots[slots.length - 1];
    const endTime = dayjs(lastSlot.endISO).tz(TZ);
    
    assert.ok(endTime.hour() <= 17, "Last slot should not extend beyond working hours");
  });
});

// ============================================================================
// CUSTOM SCHEDULE
// ============================================================================

describe("Custom Schedule", () => {
  it("should prioritize custom schedule over regular working hours", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
      customSchedule: {
        "2026-02-09": [{ start: "10:00", end: "14:00" }], // Custom hours for this day
      },
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    // Should only have slots from 10:00-14:00 (4 slots)
    assert.strictEqual(slots.length, 4);
    
    const firstSlot = dayjs(slots[0].startISO).tz(TZ);
    const lastSlot = dayjs(slots[slots.length - 1].startISO).tz(TZ);
    
    assert.strictEqual(firstSlot.format("HH:mm"), "10:00");
    assert.strictEqual(lastSlot.format("HH:mm"), "13:00"); // Last slot that fits before 14:00
  });

  it("should handle multiple custom time windows in a day", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
      customSchedule: {
        "2026-02-09": [
          { start: "09:00", end: "12:00" },
          { start: "14:00", end: "17:00" },
        ],
      },
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    // Should have slots from both windows
    assert.ok(slots.length >= 6); // At least 3 morning + 3 afternoon
    
    // Check no slots between 12:00 and 14:00
    const lunchSlots = slots.filter(s => {
      const time = dayjs(s.startISO).tz(TZ);
      return time.hour() >= 12 && time.hour() < 14;
    });
    
    assert.strictEqual(lunchSlots.length, 0);
  });
});

// ============================================================================
// ANY STAFF MODE
// ============================================================================

describe("Any Staff Mode", () => {
  it("should combine slots from multiple beauticians", () => {
    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const beautician1 = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "13:00" }],
    };

    const beautician2 = {
      _id: "b2",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "13:00", end: "17:00" }],
    };

    const slots = computeSlotsAnyStaff({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beauticians: [beautician1, beautician2],
      appointmentsByBeautician: {},
    });

    // Should have slots covering 09:00-17:00
    assert.ok(slots.length >= 7);
    
    // Each slot should have beauticianIds array
    assert.ok(Array.isArray(slots[0].beauticianIds));
  });

  it("should deduplicate overlapping time slots from multiple beauticians", () => {
    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfferMin: 0 };

    const beautician1 = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const beautician2 = {
      _id: "b2",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const slots = computeSlotsAnyStaff({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beauticians: [beautician1, beautician2],
      appointmentsByBeautician: {},
    });

    // Should have unique start times
    const startTimes = slots.map(s => s.startISO);
    const uniqueStartTimes = [...new Set(startTimes)];
    
    assert.strictEqual(startTimes.length, uniqueStartTimes.length);
    
    // Each slot should list both beauticians
    assert.strictEqual(slots[0].beauticianIds.length, 2);
  });

  it("should respect individual beautician appointments", () => {
    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const beautician1 = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const beautician2 = {
      _id: "b2",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const slots = computeSlotsAnyStaff({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beauticians: [beautician1, beautician2],
      appointmentsByBeautician: {
        b1: [
          {
            start: "2026-02-09T10:00:00.000Z",
            end: "2026-02-09T11:00:00.000Z",
            status: "confirmed",
          },
        ],
      },
    });

    // 10:00 slot should only have b2
    const slot10 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "10:00"
    );
    
    assert.ok(slot10);
    assert.strictEqual(slot10.beauticianIds.length, 1);
    assert.strictEqual(slot10.beauticianIds[0], "b2");
  });
});

// ============================================================================
// NEXT AVAILABLE SLOT
// ============================================================================

describe("Next Available Slot", () => {
  it("should find next available slot within horizon", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [
        { dayOfWeek: 1, start: "09:00", end: "17:00" }, // Monday
        { dayOfWeek: 2, start: "09:00", end: "17:00" }, // Tuesday
      ],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    // Fill Monday completely with appointments
    const mondayAppointments = Array.from({ length: 8 }, (_, i) => ({
      start: dayjs("2026-02-09").tz(TZ).hour(9 + i).toISOString(),
      end: dayjs("2026-02-09").tz(TZ).hour(10 + i).toISOString(),
      status: "confirmed",
    }));

    const nextSlot = nextAvailableSlot({
      date: "2026-02-09", // Monday (fully booked)
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: mondayAppointments,
      horizonDays: 7,
    });

    assert.ok(nextSlot);
    // Should be on Tuesday
    const slotDate = dayjs(nextSlot.startISO).tz(TZ);
    assert.strictEqual(slotDate.format("YYYY-MM-DD"), "2026-02-10");
  });

  it("should return null if no slots available within horizon", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [], // No working hours
    };

    const service = { durationMin: 60 };

    const nextSlot = nextAvailableSlot({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
      horizonDays: 7,
    });

    assert.strictEqual(nextSlot, null);
  });
});

// ============================================================================
// TIMEZONE HANDLING
// ============================================================================

describe("Timezone Handling", () => {
  it("should handle GMT timezone correctly", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    assert.ok(slots.length > 0);
    
    // Verify ISO timestamps are correct
    const firstSlot = dayjs(slots[0].startISO);
    assert.ok(firstSlot.isValid());
  });

  it("should filter out past slots for today", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [
        { dayOfWeek: 0, start: "00:00", end: "23:59" },
        { dayOfWeek: 1, start: "00:00", end: "23:59" },
        { dayOfWeek: 2, start: "00:00", end: "23:59" },
        { dayOfWeek: 3, start: "00:00", end: "23:59" },
        { dayOfWeek: 4, start: "00:00", end: "23:59" },
        { dayOfWeek: 5, start: "00:00", end: "23:59" },
        { dayOfWeek: 6, start: "00:00", end: "23:59" },
      ],
    };

    const service = { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const today = dayjs().tz(TZ).format("YYYY-MM-DD");
    const now = dayjs().tz(TZ);

    const slots = computeSlotsForBeautician({
      date: today,
      salonTz: TZ,
      stepMin: 30,
      service,
      beautician,
      appointments: [],
    });

    // All slots should be in the future
    slots.forEach(slot => {
      const slotTime = dayjs(slot.startISO);
      assert.ok(slotTime.isAfter(now), `Slot ${slotTime.format()} should be after now ${now.format()}`);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("Edge Cases", () => {
  it("should handle zero-length breaks", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [
        { 
          dayOfWeek: 1, 
          start: "09:00", 
          end: "17:00",
          breaks: [{ start: "12:00", end: "12:00" }] // Zero-length break
        }
      ],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments: [],
    });

    // Should generate slots normally
    assert.ok(slots.length > 0);
  });

  it("should handle very short service durations", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "10:00" }],
    };

    const service = { durationMin: 5, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 5,
      service,
      beautician,
      appointments: [],
    });

    // Should have many slots
    assert.ok(slots.length >= 10);
  });

  it("should handle services longer than working hours", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "10:00" }],
    };

    const service = { durationMin: 120, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 15,
      service,
      beautician,
      appointments: [],
    });

    // Should have no slots
    assert.strictEqual(slots.length, 0);
  });

  it("should handle appointment exactly at working hours boundary", () => {
    const beautician = {
      _id: "b1",
      active: true,
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };

    const appointments = [
      {
        start: "2026-02-09T09:00:00.000Z",
        end: "2026-02-09T10:00:00.000Z",
        status: "confirmed",
      },
    ];

    const slots = computeSlotsForBeautician({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beautician,
      appointments,
    });

    // 10:00 slot should be available (appointment ends at 10:00)
    const slot10 = slots.find(s => 
      dayjs(s.startISO).tz(TZ).format("HH:mm") === "10:00"
    );
    
    assert.ok(slot10, "Slot at 10:00 should be available");
  });

  it("should handle empty beautician array in any staff mode", () => {
    const service = { durationMin: 60 };

    const slots = computeSlotsAnyStaff({
      date: "2026-02-09",
      salonTz: TZ,
      stepMin: 60,
      service,
      beauticians: [],
      appointmentsByBeautician: {},
    });

    assert.strictEqual(slots.length, 0);
  });
});

console.log("\n✅ All slot planner tests completed!\n");
