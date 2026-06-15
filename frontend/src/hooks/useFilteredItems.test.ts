import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFilteredItems } from "./useFilteredItems";
import type { WorkItem, DiffInfo } from "@/types/api";

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: "Test item",
    state: "Active",
    type: "User Story",
    assignedTo: "Alice",
    description: "",
    ...overrides,
  };
}

function makeDiff(overrides: Partial<DiffInfo> = {}): DiffInfo {
  return {
    prev_time: "2025-01-01T00:00:00Z",
    new_items: [],
    continuing_items: [],
    gone_items: [],
    ...overrides,
  };
}

const INCOMPLETE_STATES = ["Active", "New", "In Progress"];
const NO_SEARCH = "";
const NO_DIFF_FILTER = null;
const ALL_STATES = "all";

describe("useFilteredItems", () => {
  describe("state filter", () => {
    const items = [
      makeItem({ id: 1, state: "Active" }),
      makeItem({ id: 2, state: "Resolved" }),
      makeItem({ id: 3, state: "In Progress" }),
      makeItem({ id: 4, state: "Closed" }),
    ];

    it("returns all items when filter is 'all'", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(4);
    });

    it("filters to open (incomplete) items only", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "open", NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
      expect(result.current.map((it) => it.id).sort()).toEqual([1, 3]);
    });

    it("filters to done (not incomplete) items only", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "done", NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
      expect(result.current.map((it) => it.id).sort()).toEqual([2, 4]);
    });

    it("filters by exact state name (case-insensitive)", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "closed", NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(4);
    });

    it("filters to bugs only", () => {
      const mixed = [
        makeItem({ id: 1, type: "Bug", state: "Active" }),
        makeItem({ id: 2, type: "User Story", state: "Active" }),
        makeItem({ id: 3, type: "Bug", state: "Resolved" }),
      ];
      const { result } = renderHook(() =>
        useFilteredItems(mixed, null, NO_DIFF_FILTER, "bug", NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
      expect(result.current.map((it) => it.id).sort()).toEqual([1, 3]);
    });
  });

  describe("diff filter", () => {
    const diff = makeDiff({
      new_items: [
        makeItem({ id: 10, title: "New A", state: "Active" }),
        makeItem({ id: 11, title: "New B", state: "Active" }),
      ],
      continuing_items: [
        makeItem({ id: 20, title: "Changed A", state: "Resolved", _state_changed: true }),
        makeItem({ id: 21, title: "Unchanged A", state: "Active", _state_changed: false }),
      ],
      gone_items: [
        makeItem({ id: 30, title: "Gone A", state: "Resolved" }),
        makeItem({ id: 31, title: "Gone B", state: "Active" }),
      ],
    });

    const allItems = [
      makeItem({ id: 10, title: "New A", state: "Active" }),
      makeItem({ id: 11, title: "New B", state: "Active" }),
      makeItem({ id: 20, title: "Changed A", state: "Resolved" }),
      makeItem({ id: 21, title: "Unchanged A", state: "Active" }),
      makeItem({ id: 30, title: "Gone A", state: "Resolved" }),
      makeItem({ id: 31, title: "Gone B", state: "Active" }),
    ];

    it("returns only new items when diffFilter is 'new'", () => {
      const { result } = renderHook(() =>
        useFilteredItems(allItems, diff, "new", ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
      expect(result.current.map((it) => it.id).sort()).toEqual([10, 11]);
    });

    it("returns only changed (state-changed continuing) items when diffFilter is 'changed'", () => {
      const { result } = renderHook(() =>
        useFilteredItems(allItems, diff, "changed", ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(20);
    });

    it("returns gone items directly from diff when diffFilter is 'gone'", () => {
      // gone_items are taken directly from diff, not filtered from allItems
      const { result } = renderHook(() =>
        useFilteredItems(allItems, diff, "gone", ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
      expect(result.current.map((it) => it.id).sort()).toEqual([30, 31]);
    });

    it("returns all items when diffFilter is null", () => {
      const { result } = renderHook(() =>
        useFilteredItems(allItems, diff, null, ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(6);
    });
  });

  describe("search filter", () => {
    const items = [
      makeItem({ id: 1, title: "Fix login bug", assignedTo: "Alice", type: "Bug" }),
      makeItem({ id: 2, title: "Update docs", assignedTo: "Bob", type: "Task" }),
      makeItem({ id: 3, title: "Add dashboard", assignedTo: "Charlie", type: "User Story" }),
      makeItem({ id: 99, title: "Special", type: "Epic", assignedTo: "Dave", description: "This item has id 99" }),
    ];

    it("filters by title substring (case-insensitive)", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "login", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(1);
    });

    it("filters by assignedTo", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "bob", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(2);
    });

    it("filters by type", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "story", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(3);
    });

    it("filters by id", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "99", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(99);
    });

    it("filters by description", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "this item has id", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(99);
    });

    it("returns empty when no match", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "nonexistent", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(0);
    });
  });

  describe("combined filters", () => {
    const items = [
      makeItem({ id: 1, title: "Fix login bug", state: "Active", type: "Bug" }),
      makeItem({ id: 2, title: "Update login page", state: "Active", type: "User Story" }),
      makeItem({ id: 3, title: "Dashboard bug", state: "Resolved", type: "Bug" }),
    ];

    it("combines state filter and search", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "bug", "login", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(1);
    });

    it("combines open filter and search", () => {
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "open", "login", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
      expect(result.current.map((it) => it.id).sort()).toEqual([1, 2]);
    });
  });

  describe("edge cases", () => {
    it("handles empty items array", () => {
      const { result } = renderHook(() =>
        useFilteredItems([], null, NO_DIFF_FILTER, ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toEqual([]);
    });

    it("handles undefined/null fields gracefully in search", () => {
      const items = [
        makeItem({ id: 1, title: "Test", assignedTo: "", type: null as unknown as string, description: undefined as unknown as string }),
      ];
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, ALL_STATES, "test", INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(1);
    });

    it("handles incompleteStates as a different set", () => {
      const items = [
        makeItem({ id: 1, state: "Active" }),
        makeItem({ id: 2, state: "Closed" }),
      ];
      // With empty incomplete set, all items are "done"
      const { result } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "open", NO_SEARCH, []),
      );
      expect(result.current).toHaveLength(0);

      const { result: r2 } = renderHook(() =>
        useFilteredItems(items, null, NO_DIFF_FILTER, "done", NO_SEARCH, []),
      );
      expect(r2.current).toHaveLength(2);
    });

    it("diff filter with null diff returns all items", () => {
      const items = [makeItem({ id: 1 }), makeItem({ id: 2 })];
      const { result } = renderHook(() =>
        useFilteredItems(items, null, "new", ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
      );
      expect(result.current).toHaveLength(2);
    });
  });

  describe("memo stability", () => {
    it("returns same reference when inputs are unchanged", () => {
      const items = [makeItem({ id: 1 })];
      const { result, rerender } = renderHook(
        (props: [typeof items]) =>
          useFilteredItems(props[0], null, NO_DIFF_FILTER, ALL_STATES, NO_SEARCH, INCOMPLETE_STATES),
        { initialProps: [items] },
      );
      const first = result.current;
      rerender([items]);
      expect(result.current).toBe(first);
    });
  });
});
