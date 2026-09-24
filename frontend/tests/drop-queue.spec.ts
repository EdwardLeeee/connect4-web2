import { createApp, defineComponent, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropDuration, useDropQueue } from "../src/composables/useDropQueue";

let app: App | null = null;

function mountQueue(reduced = false) {
  const reducedMotion = ref(reduced);
  let queue!: ReturnType<typeof useDropQueue>;
  app = createApp(
    defineComponent({
      setup() {
        queue = useDropQueue(reducedMotion);
        return () => null;
      },
    }),
  );
  app.mount(document.createElement("div"));
  return queue;
}

// Your move one row above the bottom stack, then an instant AI reply.
const YOURS = { row: 3, column: 4 };
const REPLY = { row: 5, column: 1 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  app?.unmount();
  app = null;
  vi.useRealTimers();
});

describe("drop queue (A01)", () => {
  it("drops moves that arrive together one after another", () => {
    const queue = mountQueue();
    queue.enqueue([YOURS, REPLY]);
    expect(queue.states.value).toEqual({ "3:4": "dropping", "5:1": "queued" });

    vi.advanceTimersByTime(dropDuration(YOURS.row) - 1);
    expect(queue.states.value["5:1"]).toBe("queued");
    vi.advanceTimersByTime(1);
    expect(queue.states.value["5:1"]).toBe("dropping");

    vi.advanceTimersByTime(dropDuration(REPLY.row) + 50);
    expect(queue.states.value).toEqual({});
  });

  it("waits for a drop still in flight", () => {
    const queue = mountQueue();
    queue.enqueue([YOURS]);
    vi.advanceTimersByTime(100);
    queue.enqueue([REPLY]);
    expect(queue.states.value["5:1"]).toBe("queued");
    vi.advanceTimersByTime(dropDuration(YOURS.row) - 100);
    expect(queue.states.value["5:1"]).toBe("dropping");
  });

  it("says when the last token has landed", () => {
    const queue = mountQueue();
    expect(queue.idleIn()).toBe(0);
    queue.enqueue([YOURS, REPLY]);
    expect(queue.idleIn()).toBe(
      dropDuration(YOURS.row) + dropDuration(REPLY.row) + 50,
    );
    vi.advanceTimersByTime(queue.idleIn());
    expect(queue.idleIn()).toBe(0);
  });

  it("shows tokens at once when motion is reduced", () => {
    const queue = mountQueue(true);
    queue.enqueue([YOURS, REPLY]);
    expect(queue.states.value).toEqual({});
    expect(queue.idleIn()).toBe(0);
  });

  it("forgets pending drops on reset and on unmount", () => {
    const queue = mountQueue();
    queue.enqueue([YOURS, REPLY]);
    queue.reset();
    expect(queue.states.value).toEqual({});
    expect(queue.idleIn()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    queue.enqueue([YOURS]);
    app!.unmount();
    app = null;
    expect(vi.getTimerCount()).toBe(0);
  });
});
