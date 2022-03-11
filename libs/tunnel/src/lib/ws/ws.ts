import { WS } from '@guacamole-client/net';
import { Decoder, Encoder } from '@guacamole-client/protocol';

import {
  ServerError,
  TunnelError,
  UpstreamNotFoundError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../errors';
import { TunnelState } from '../state';
import { AbstractTunnel, INTERNAL_DATA_OPCODE, Tunnel } from '../tunnel';

export class WebSocketCloseError extends TunnelError {}

/**
 * The WebSocket protocol corresponding to the protocol used for the current
 * location.
 */
const WS_PROTOCOL: Record<string, string> = {
  'http:': 'ws:',
  'https:': 'wss:',
};

// Transform current URL to WebSocket URL
export const buildWsTunnelUrl = (tunnelURL: string): string => {
  let url = tunnelURL;

  // If not already a websocket URL
  if (!tunnelURL.startsWith('ws:') && !tunnelURL.startsWith('wss:')) {
    const protocol = WS_PROTOCOL[window.location.protocol];

    // If absolute URL, convert to absolute WS URL
    if (tunnelURL.startsWith('/')) {
      url = protocol + '//' + window.location.host + tunnelURL;
    } else {
      // Otherwise, construct absolute from relative URL
      // Get path from pathname
      const slash = window.location.pathname.lastIndexOf('/');
      const path = window.location.pathname.substring(0, slash + 1);

      // Construct absolute URL
      url = protocol + '//' + window.location.host + path + tunnelURL;
    }
  }

  return url;
};

/**
 * The number of milliseconds to wait between connection stability test
 * pings.
 */
export const PING_FREQUENCY = 500;

/**
 * Returns the Guacamole protocol status code which most closely
 * represents the given WebSocket status code.
 *
 * @param code - The WebSocket status code to translate into a Guacamole
 *               protocol status code.
 *
 * @returns The Guacamole protocol status code which most closely represents
 *          the given WebSocket status code.
 */
export function errorFromWebSocketCode(code: number): TunnelError | undefined {
  // Translate status codes with known equivalents
  switch (code) {
    // Successful disconnect (no error)
    case 1000: // Normal Closure
      return undefined;

    // Codes which indicate the server is not reachable
    case 1006: // Abnormal Closure (also signalled by JavaScript when the connection cannot be opened in the first place)
    case 1015: // TLS Handshake
      return new UpstreamNotFoundError();

    // Codes which indicate the server is reachable but busy/unavailable
    case 1001: // Going Away
    case 1012: // Service Restart
    case 1013: // Try Again Later
    case 1014: // Bad Gateway
      return new UpstreamUnavailableError();

    // Default all other codes to generic internal error
    default:
      return new ServerError();
  }
}

/**
 * Guacamole Tunnel implemented over WebSocket via XMLHttpRequest.
 */
export class WebSocketTunnel extends AbstractTunnel implements Tunnel {
  /**
   * The URL of the WebSocket tunneling service.
   * @private
   */
  private readonly baseUrl: string;

  /**
   * The WebSocket used by this tunnel.
   * @private
   */
  private readonly socket: WS;

  /**
   * The current receive timeout ID, if any.
   * @private
   */
  private receiveTimeoutHandle?: number;
  /**
   * The current connection stability timeout ID, if any.
   * @private
   */
  private unstableTimeoutHandle?: number;

  /**
   * The current connection stability test ping interval ID, if any. This
   * will only be set upon successful connection.
   * @private
   */
  private pingIntervalHandle?: number;

  private readonly encoder: Encoder;
  private readonly decoder: Decoder;

  /*
   * @constructor
   * @param socket - The WebSocket instance
   * @param baseUrl - The URL of the WebSocket tunneling service.
   */
  constructor(socket: WS, baseUrl: string) {
    super();

    // Set encoder and decoder instances and bind events
    this.encoder = new Encoder();
    this.decoder = new Decoder();

    this.decoder.oninstruction = (opcode, parameters) => {
      if (this.oninstruction !== null) {
        this.oninstruction(opcode, parameters);
      }
    };
    this.decoder.addInstructionListener(
      INTERNAL_DATA_OPCODE,
      (opcode, params) => {
        if (this.uuid !== null) {
          return;
        }

        // Associate tunnel UUID if received
        this.setUUID(params[0]);

        // Tunnel is now open and UUID is available
        this.setState(TunnelState.OPEN);
      },
    );

    // Transform current URL to WebSocket URL
    this.baseUrl = baseUrl;

    // Set socket object and bind listeners
    this.socket = socket;

    this.socket.onopen = (_: Event) => {
      this.resetTimeout();

      // Ping tunnel endpoint regularly to test connection stability
      this.pingIntervalHandle = window.setInterval(() => {
        this.sendMessage(INTERNAL_DATA_OPCODE, 'ping', new Date().getTime());
      }, PING_FREQUENCY);
    };

    this.socket.onclose = (event: CloseEvent) => {
      // Pull status code directly from closure reason provided by Guacamole
      if (event.reason) {
        this.closeTunnel(new WebSocketCloseError(event.reason));
      } else if (event.code) {
        // Failing that, derive a Guacamole status code from the WebSocket
        // status code provided by the browser
        this.closeTunnel(errorFromWebSocketCode(event.code));
      } else {
        // Otherwise, assume server is unreachable
        this.closeTunnel(new UpstreamNotFoundError());
      }
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      this.resetTimeout();

      const message = event.data;
      this.decoder.receive(message);
    };
  }

  public connect(data?: string | URLSearchParams) {
    this.resetTimeout();

    // Mark the tunnel as connecting
    this.setState(TunnelState.CONNECTING);

    // Build the connection URL
    const url = new URL(this.baseUrl);

    if (data !== undefined) {
      const search = new URLSearchParams(data);
      url.search = search.toString();
    }

    // Connect socket to URL
    this.socket.connect(url, 'guacamole');
  }

  public disconnect() {
    this.closeTunnel();
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
    const message = this.encoder.encode(opcode, ...params);

    this.socket.send(message);
  }

  /**
   * Initiates a timeout which, if data is not received, causes the tunnel
   * to close with an error.
   */
  private resetTimeout() {
    // Get rid of old timeouts (if any)
    window.clearTimeout(this.receiveTimeoutHandle);
    window.clearTimeout(this.unstableTimeoutHandle);

    // Clear unstable status
    if (this.state === TunnelState.UNSTABLE) {
      this.setState(TunnelState.OPEN);
    }

    // Set new timeout for tracking overall connection timeout
    this.receiveTimeoutHandle = window.setTimeout(() => {
      this.closeTunnel(new UpstreamTimeoutError('Server timeout.'));
    }, this.receiveTimeout);

    // Set new timeout for tracking suspected connection instability
    this.unstableTimeoutHandle = window.setTimeout(() => {
      this.setState(TunnelState.UNSTABLE);
    }, this.unstableThreshold);
  }

  /**
   * Closes this tunnel, signaling the given status and corresponding
   * message, which will be sent to the onerror handler if the status is
   * an error status.
   *
   * @param error - The error causing the connection to close
   */
  private closeTunnel(error?: TunnelError) {
    // Get rid of old timeouts (if any)
    window.clearTimeout(this.receiveTimeoutHandle);
    window.clearTimeout(this.unstableTimeoutHandle);

    // Cease connection test pings
    window.clearInterval(this.pingIntervalHandle);

    // Ignore if already closed
    if (this.state === TunnelState.CLOSED) {
      return;
    }

    // If connection closed abnormally, signal error.
    if (error !== undefined && this.onerror) {
      this.onerror(error);
    }

    // Mark as closed
    this.setState(TunnelState.CLOSED);

    this.socket.close();
  }
}
