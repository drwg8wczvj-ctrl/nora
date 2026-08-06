import { describe, expect, it } from "vitest";
import {
  buildDailyPlan,
  buildDailyReview,
  buildWeeklyIntelligence,
  calculateDeadlineHealth,
  createFocusSession,
  inferTaskIntelligence,
  normalizeIntelligentTask,
  recommendBreak,
  suggestReschedule,
  suggestTaskSchedule,
} from "./taskIntelligence";
import type { PlannerTask } from "./taskSchema";

const task = (patch: Partial<PlannerTask> = {}): PlannerTask => ({
  id: "task-1",
  title: "Write business proposal",
  date: "2026-08-07",
  startHour: null,
  startMinute: null,
  duration: 120,
  completed: false,
  type: "task",
  ...patch,
});

describe("Intelligent workflow engine", () => {
  it("migrates old tasks without removing legacy fields", () => {
    const migrated = normalizeIntelligentTask(task());
    expect(migrated.title).toBe("Write business proposal");
    expect(migrated.estimatedDuration).toBe(120);
    expect(migrated.cognitiveLoad).toBe("deep");
    expect(migrated.status).toBe("inbox");
    expect(migrated.history).toEqual([]);
  });

  it("infers calm, editable suggestions from a title", () => {
    expect(inferTaskIntelligence("Reply to emails")).toMatchObject({
      energyLevel: "low",
      cognitiveLoad: "simple",
      category: "Admin",
    });
  });

  it("marks impossible deadlines as at risk", () => {
    const now = new Date("2026-08-06T17:30:00");
    const result = calculateDeadlineHealth(
      task({ deadline: "2026-08-06", estimatedDuration: 180 }),
      [],
      now,
    );
    expect(["risk", "critical"]).toContain(result.level);
    expect(result.requiredMinutes).toBe(180);
  });

  it("splits deep work into realistic protected blocks", () => {
    const result = suggestTaskSchedule(
      task({ deadline: "2026-08-09", estimatedDuration: 240, cognitiveLoad: "deep" }),
      [],
      new Date("2026-08-06T08:00:00"),
    );
    expect(result.feasible).toBe(true);
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0].duration).toBe(90);
  });

  it("suggests splitting a task that has moved repeatedly", () => {
    const result = suggestReschedule(task({
      history: [
        { type: "rescheduled", at: "2026-08-01T10:00:00.000Z" },
        { type: "rescheduled", at: "2026-08-02T10:00:00.000Z" },
      ],
    }), [], new Date("2026-08-06T08:00:00"));
    expect(result.action).toBe("split");
    expect(result.message).toContain("moved");
  });

  it("adapts recovery breaks to intensity and health", () => {
    const short = recommendBreak({ focusMinutes: 25, cognitiveLoad: "simple", energy: 8, recovery: 90 });
    const deep = recommendBreak({ focusMinutes: 90, cognitiveLoad: "deep", energy: 2, recovery: 35 });
    expect(short.minutes).toBeLessThan(deep.minutes);
    expect(deep.type).toBe("physical");
  });

  it("creates task-powered focus sessions with a concrete outcome", () => {
    const session = createFocusSession(task({ intention: "It supports the university application", cognitiveLoad: "deep" }));
    expect(session.taskId).toBe("task-1");
    expect(session.duration).toBe(90);
    expect(session.goal).toContain("university application");
  });

  it("ranks daily priorities without hiding flexible work", () => {
    const plan = buildDailyPlan([
      task({ id: "a", title: "Admin", priority: "low", cognitiveLoad: "simple" }),
      task({ id: "b", title: "Exam", priority: "critical", cognitiveLoad: "deep" }),
    ], "2026-08-07", 8);
    expect(plan.topPriorities[0].id).toBe("b");
    expect(plan.flexible).toHaveLength(2);
  });

  it("creates evidence-backed daily and weekly reviews", () => {
    const history = [
      task({ id: "deep", completed: true, cognitiveLoad: "deep", actualDuration: 120, estimatedDuration: 90 }),
      task({ id: "admin", title: "Finance admin", category: "Admin", startHour: 19, completed: false }),
    ];
    const daily = buildDailyReview(history, "2026-08-07", 120);
    const weekly = buildWeeklyIntelligence(history, new Date("2026-08-07T20:00:00"));
    expect(daily.achievement).toContain("Write business proposal");
    expect(daily.tomorrowSuggestion).toContain("earlier");
    expect(weekly.estimationDelta).toBe(33);
  });
});
