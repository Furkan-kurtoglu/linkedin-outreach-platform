import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  dailyPlan,
  invitesRemainingToday,
  parseTime,
  planInviteTimes,
  validateSchedule,
  type DaySchedule,
  type ScheduleConfig,
} from "./index";

const win = (a: string, b: string) => ({ startMin: parseTime(a)!, endMin: parseTime(b)! });

/** Pazar kapalı, Cumartesi yarım gün, hafta içi öğle arası boş */
function custom(): ScheduleConfig {
  const weekday: DaySchedule = { enabled: true, windows: [win("09:00", "12:00"), win("13:30", "18:30")] };
  return {
    ...DEFAULT_SCHEDULE,
    weeklyInvites: 150,
    days: [
      { enabled: false, windows: [] },
      { ...weekday, invites: 35 },
      weekday,
      weekday,
      weekday,
      weekday,
      { enabled: true, windows: [win("10:00", "13:00")], invites: 10 },
    ],
  };
}

describe("gün gün ayar", () => {
  it("sabit hedefli günleri korur, kalanı diğer günlere dağıtır", () => {
    const plan = dailyPlan(custom());
    expect(plan.get(0)).toBe(0);
    expect(plan.get(1)).toBe(35);
    expect(plan.get(6)).toBe(10);
    // 150 - 35 - 10 = 105, 4 güne: 27, 26, 26, 26
    const auto = [2, 3, 4, 5].map((d) => plan.get(d)!);
    expect(auto.reduce((a, b) => a + b, 0)).toBe(105);
  });

  it("kapalı günde davet planlamaz", () => {
    const sunday = new Date(Date.UTC(2026, 9, 11, 7, 0)); // 11 Ekim 2026 Pazar, 10:00 İstanbul
    expect(planInviteTimes({ now: sunday, count: 10, config: custom() })).toHaveLength(0);
  });

  it("öğle arasına davet koymaz, iki aralığı da kullanır", () => {
    const monday = new Date(Date.UTC(2026, 9, 12, 5, 0)); // 08:00 İstanbul
    let seed = 0.42;
    const rng = () => (seed = ((seed * 9301 + 49297) % 233280) / 233280);
    const times = planInviteTimes({ now: monday, count: 35, config: custom(), rng });
    const mins = times.map((t) => (t.getUTCHours() * 60 + t.getUTCMinutes() + 180) % 1440);
    expect(mins.every((m) => (m >= 540 && m <= 720) || (m >= 810 && m <= 1110))).toBe(true);
    expect(mins.some((m) => m >= 810)).toBe(true);
  });

  it("günlük kalan hakkı gün ayarına göre hesaplar", () => {
    expect(invitesRemainingToday({ config: custom(), weeklyBudget: 150, localDay: 6, sentToday: 4, sentLast7Days: 90 })).toBe(6);
    expect(invitesRemainingToday({ config: custom(), weeklyBudget: 150, localDay: 0, sentToday: 0, sentLast7Days: 0 })).toBe(0);
  });
});

describe("ayar denetimi", () => {
  it("geçerli ayarda hata vermez", () => {
    expect(validateSchedule(custom()).filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("haftalık 200 üstünü reddeder", () => {
    expect(validateSchedule({ ...custom(), weeklyInvites: 250 }).some((i) => i.level === "error")).toBe(true);
  });

  it("ters ve çakışan saatleri yakalar", () => {
    const c = custom();
    c.days![2] = { enabled: true, windows: [win("12:00", "10:00")] };
    c.days![3] = { enabled: true, windows: [win("09:00", "12:00"), win("11:00", "14:00")] };
    const errs = validateSchedule(c).filter((i) => i.level === "error");
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it("saatlere sığmayan hedef için uyarır", () => {
    const c = custom();
    c.days![6] = { enabled: true, windows: [win("10:00", "11:00")], invites: 30 };
    expect(validateSchedule(c).some((i) => i.level === "warning" && i.day === 6)).toBe(true);
  });

  it("saat metnini çözer", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("9.05")).toBe(545);
    expect(parseTime("25:00")).toBe(null);
  });
});
