// TODO Review the following lint suppression
/* eslint-disable @typescript-eslint/naming-convention */
import AbstractTunnel, { INTERNAL_DATA_OPCODE, Tunnel } from "./tunnel";
import { State } from "./state";
import { Decoder, Encoder } from "@guacamole-client/protocol";
import { Status, StatusCode } from "./Status";

/**
 * The WebSocket protocol corresponding to the protocol used for the current
 * location.
 * @private
 */
const WS_PROTOCOL: Record<string, string> = {
  "http:": "ws:",
  "https:": "wss:"
};

/**
 * The number of milliseconds to wait between connection stability test
 * pings.
 *
 * @private
 * @constant
 */
const PING_FREQUENCY = 500;

/**
 * Guacamole Tunnel implemented over WebSocket via XMLHttpRequest.
 */
export default class WebSocketTunnel extends AbstractTunnel implements Tunnel {
  /**
   * The WebSocket used by this tunnel.
   * @private
   */
  private socket: WebSocket | null = null;

  /**
   * The current receive timeout ID, if any.
   * @private
   */
  private receiveTimeoutHandle?: number;

  /**
   * The current connection stability timeout ID, if any.
   *
   * @private
   */
  private unstableTimeoutHandle?: number;

  /**
   * The current connection stability test ping interval ID, if any. This
   * will only be set upon successful connection.
   *
   * @private
   */
  private pingIntervalHandle?: number;

  /*
   * @constructor
   * @augments Tunnel
   * @param tunnelURL - The URL of the WebSocket tunneling service.
   */
  constructor(private readonly tunnelURL: string) {
    super();

    // Transform current URL to WebSocket URL

    // If not already a websocket URL
    if (!tunnelURL.startsWith("ws:") && !tunnelURL.startsWith("wss:")) {
      const protocol = WS_PROTOCOL[window.location.protocol];

      // If absolute URL, convert to absolute WS URL
      if (tunnelURL.startsWith("/")) {
        this.tunnelURL = protocol + "//" + window.location.host + tunnelURL;
      } else {
        // Otherwise, construct absolute from relative URL
        // Get path from pathname
        const slash = window.location.pathname.lastIndexOf("/");
        const path = window.location.pathname.substring(0, slash + 1);

        // Construct absolute URL
        this.tunnelURL = protocol + "//" + window.location.host + path + tunnelURL;
      }
    }
  }

  public sendMessage(...elements: any[]) {
    // Do not attempt to send messages if not connected
    if (!this.isConnected()) {
      return;
    }

    // Do not attempt to send empty messages
    if (elements.length === 0) {
      return;
    }

    const [opcode, ...params] = elements;
    const encoder = new Encoder();

    let message = encoder.encode(opcode, ...params);

    this.socket?.send(message);
  }

  public connect(data?: string) {
    this.resetTimeout();

    // Mark the tunnel as connecting
    this.setState(State.CONNECTING);

    // Connect socket
    const urlDataParam = data === undefined ? "" : `?${data}`;
    this.socket = new WebSocket(`${this.tunnelURL}${urlDataParam}`, "guacamole");

    this.socket.onopen = _event => {
      this.resetTimeout();

      // Ping tunnel endpoint regularly to test connection stability
      this.pingIntervalHandle = window.setInterval(() => {
        this.sendMessage(INTERNAL_DATA_OPCODE, "ping", new Date().getTime());
      }, PING_FREQUENCY);
    };

    this.socket.onclose = (event: CloseEvent) => {
      // Pull status code directly from closure reason provided by Guacamole
      if (event.reason) {
        this.closeTunnel(new Status(parseInt(event.reason, 10), event.reason));
      } else if (event.code) {
        // Failing that, derive a Guacamole status code from the WebSocket
        // status code provided by the browser
        // TODO Review the following lint suppression
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        this.closeTunnel(new Status(StatusCode.fromWebSocketCode(event.code)));
      } else {
        // Otherwise, assume server is unreachable
        this.closeTunnel(new Status(StatusCode.UPSTREAM_NOT_FOUND));
      }
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      this.resetTimeout();

      const message = event.data;
      const decoder = new Decoder();
      decoder.oninstruction = (opcode, parameters) => {
        if (this.uuid === null) {
          // Associate tunnel UUID if received
          if (opcode === INTERNAL_DATA_OPCODE) {
            this.setUUID(parameters[0]);
          }

          // Tunnel is now open and UUID is available
          this.setState(State.OPEN);
          return;
        }

        if (this.oninstruction !== null) {
          this.oninstruction(opcode, parameters);
        }
      };

      decoder.receive(message);
    };
  }

  public disconnect() {
    this.closeTunnel(new Status(StatusCode.SUCCESS, "Manually closed."));
  }

  /**
   * Initiates a timeout which, if data is not received, causes the tunnel
   * to close with an error.
   *
   * @private
   */
  private resetTimeout() {
    // Get rid of old timeouts (if any)
    window.clearTimeout(this.receiveTimeoutHandle);
    window.clearTimeout(this.unstableTimeoutHandle);

    // Clear unstable status
    if (this.state === State.UNSTABLE) {
      this.setState(State.OPEN);
    }

    // Set new timeout for tracking overall connection timeout
    this.receiveTimeoutHandle = window.setTimeout(() => {
      this.closeTunnel(new Status(StatusCode.UPSTREAM_TIMEOUT, "Server timeout."));
    }, this.receiveTimeout);

    // Set new timeout for tracking suspected connection instability
    this.unstableTimeoutHandle = window.setTimeout(() => {
      this.setState(State.UNSTABLE);
    }, this.unstableThreshold);
  }

  /**
   * Closes this tunnel, signaling the given status and corresponding
   * message, which will be sent to the onerror handler if the status is
   * an error status.
   *
   * @private
   * @param status - The status causing the connection to close;
   */
  private closeTunnel(status: Status) {
    // Get rid of old timeouts (if any)
    window.clearTimeout(this.receiveTimeoutHandle);
    window.clearTimeout(this.unstableTimeoutHandle);

    // Cease connection test pings
    window.clearInterval(this.pingIntervalHandle);

    // Ignore if already closed
    if (this.state === State.CLOSED) {
      return;
    }

    // If connection closed abnormally, signal error.
    if (status.code !== StatusCode.SUCCESS && this.onerror) {
      this.onerror(status);
    }

    // Mark as closed
    this.setState(State.CLOSED);

    this.socket?.close();
  }
}

