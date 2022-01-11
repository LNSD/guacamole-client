export interface WS extends WebSocket {
  connect(url: string | URL, protocols?: string | string[] | undefined): void;
}

export enum WsReadyState {
  NOT_CONNECTED = -1,
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

export class ConnectableWebSocket implements WS {
  // Ready state
  NOT_CONNECTED: number = WsReadyState.CLOSED;
  CONNECTING: number = WsReadyState.CONNECTING;
  OPEN: number = WsReadyState.OPEN;
  CLOSING: number = WsReadyState.CLOSING;
  CLOSED: number = WsReadyState.CLOSED;

  private socket?: WebSocket;

  private _binaryType: BinaryType = "blob";

  get binaryType(): BinaryType {
    return this._binaryType;
  }

  set binaryType(binaryType: BinaryType) {
    this._binaryType = binaryType;

    if (this.socket !== undefined) {
      this.socket.binaryType = binaryType;
    }
  }

  get bufferedAmount(): number {
    return this.socket?.bufferedAmount ?? 0;
  }

  get extensions(): string {
    return this.socket?.extensions ?? "";
  }

  get protocol(): string {
    return this.socket?.protocol ?? "";
  }

  get readyState(): number {
    return this.socket?.readyState ?? this.NOT_CONNECTED;
  }

  get url(): string {
    return this.socket?.url ?? "";
  }

  private _onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;

  set onclose(value: ((this: WebSocket, ev: CloseEvent) => any) | null) {
    this._onclose = value;
  }

  private _onerror: ((this: WebSocket, ev: Event) => any) | null = null;

  set onerror(value: ((this: WebSocket, ev: Event) => any) | null) {
    this._onerror = value;
  }

  private _onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;

  set onmessage(value: ((this: WebSocket, ev: MessageEvent) => any) | null) {
    this._onmessage = value;
  }

  private _onopen: ((this: WebSocket, ev: Event) => any) | null = null;

  set onopen(value: ((this: WebSocket, ev: Event) => any) | null) {
    this._onopen = value;
  }

  close(code?: number, reason?: string): void {
    if (this.socket === undefined) {
      return;
    }

    this.socket.close(code, reason);
  }

  connect(url: string | URL, protocols?: string | string[] | undefined): void {
    this.socket = new WebSocket(url, protocols);

    this.socket.binaryType = this._binaryType;

    this.socket.onerror = this._onerror;
    this.socket.onclose = this._onclose;
    this.socket.onmessage = this._onmessage;
    this.socket.onopen = this._onopen;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.socket === undefined) {
      return;
    }

    this.socket.send(data);
  }

  addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: any, listener: any, options?: any): void {
    throw new Error("Method not implemented.");
  }

  removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: any, listener: any, options?: any): void {
    throw new Error("Method not implemented.");
  }

  dispatchEvent(event: Event): boolean {
    throw new Error("Method not implemented.");
  }
}
