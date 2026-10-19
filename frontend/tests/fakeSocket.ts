import { pageSnapshot, type PageId } from "../e2e/states";

// A WebSocket that tests drive by hand: open it, deliver snapshots, close it.
type Listener = (event: Event) => void;

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  /** The same messages, payloads included. */
  messages: { type: string; payload: unknown }[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string) {
    const message = JSON.parse(data);
    this.sent.push(message.type);
    this.messages.push(message);
  }

  // A dead socket never confirms the close.
  close() {
    this.readyState = FakeWebSocket.CLOSING;
  }

  emit(type: string, init: { code?: number; data?: unknown } = {}) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    if (type === "close") this.readyState = FakeWebSocket.CLOSED;
    const event =
      type === "close"
        ? new CloseEvent(type, { code: init.code ?? 1006 })
        : type === "message"
          ? new MessageEvent(type, { data: JSON.stringify(init.data) })
          : new Event(type);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** Accepts the connection with the state of a page. */
  connect(id: PageId) {
    this.emit("open");
    this.emit("message", {
      data: { type: "state.snapshot", payload: pageSnapshot(id, "en") },
    });
  }
}
