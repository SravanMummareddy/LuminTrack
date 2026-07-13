import { describe, it, expect } from "vitest";
import {
  docUrgency,
  groupByUrgency,
  sortTodos,
  type TodoItem,
} from "@/server/pending";

function todo(over: Partial<TodoItem>): TodoItem {
  return {
    kind: "submission_stale",
    urgency: "backlog",
    href: "/x",
    primary: "p",
    secondary: "s",
    ownerId: "u",
    ownerName: "n",
    at: 0,
    ...over,
  };
}

describe("docUrgency", () => {
  const now = 1_000_000;
  it("is overdue when already expired, soon otherwise", () => {
    expect(docUrgency(new Date(now - 1), now)).toBe("overdue");
    expect(docUrgency(new Date(now + 1), now)).toBe("soon");
    expect(docUrgency(null, now)).toBe("soon");
  });
});

describe("groupByUrgency", () => {
  it("splits into the three tiers", () => {
    const g = groupByUrgency([
      todo({ urgency: "overdue" }),
      todo({ urgency: "soon" }),
      todo({ urgency: "soon" }),
      todo({ urgency: "backlog" }),
    ]);
    expect(g.overdue).toHaveLength(1);
    expect(g.soon).toHaveLength(2);
    expect(g.backlog).toHaveLength(1);
  });

  it("orders each tier most-urgent (smallest `at`) first", () => {
    const g = groupByUrgency([
      todo({ urgency: "soon", primary: "later", at: 200 }),
      todo({ urgency: "soon", primary: "sooner", at: 100 }),
    ]);
    expect(g.soon.map((t) => t.primary)).toEqual(["sooner", "later"]);
  });
});

describe("sortTodos", () => {
  it("reads overdue → soon → backlog, urgent-first within tier", () => {
    const out = sortTodos([
      todo({ urgency: "backlog", primary: "b" }),
      todo({ urgency: "overdue", primary: "o2", at: 50 }),
      todo({ urgency: "overdue", primary: "o1", at: 10 }),
      todo({ urgency: "soon", primary: "s" }),
    ]);
    expect(out.map((t) => t.primary)).toEqual(["o1", "o2", "s", "b"]);
  });
});
