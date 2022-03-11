import { HttpRequest } from '@guacamole-client/net';
import { ClientControl, Decoder, Encoder } from '@guacamole-client/protocol';

import {
  ClientBadRequestError,
  ClientForbiddenError,
  ClientTooManyError,
  ResourceNotFoundError,
  ServerBusyError,
  ServerError,
  TunnelError,
  UpstreamNotFoundError,
  UpstreamTimeoutError,
} from '../errors';
import { TunnelState } from '../state';
import { AbstractTunnel, INTERNAL_DATA_OPCODE, Tunnel } from '../tunnel';
import { GuacamoleHttpClient } from './client';

/**
 * The number of milliseconds to wait between connection stability test
 * pings.
 *
 * @private
 * @constant
 */
const PING_FREQUENCY = 500;

export class HttpGuacamoleError extends TunnelError {
  constructor(public readonly code?: number, message?: string) {
    super(message);
  }
}

/**
 * Returns the TunnelError which most closely represents the given HTTP status code.
 *
 * @param status - The HTTP status code to translate into a tunnel error.
 * @param message - Error message.
 *
 * @returns The Tunnel Error which most closely represents the given HTTP status code.
 */
export function errorFromHTTPCode(
  status: number,
  message?: string,
): TunnelError {
  // Translate status codes with known equivalents
  switch (status) {
    // HTTP 400 - Bad request
    case 400:
      return new ClientBadRequestError(message);

    // HTTP 403 - Forbidden
    case 403:
      return new ClientForbiddenError(message);

    // HTTP 404 - Resource not found
    case 404:
      return new ResourceNotFoundError(message);

    // HTTP 429 - Too many requests
    case 429:
      return new ClientTooManyError(message);

    // HTTP 503 - Server unavailable
    case 503:
      return new ServerBusyError(message);

    // Default all other codes to generic internal error
    default:
      return new ServerError(message);
  }
}

/**
 * Guacamole Tunnel implemented over HTTP via XMLHttpRequest.
 */
export class HTTPTunnel extends AbstractTunnel implements Tunnel {
  private sendingMessages = false;
  private outputMessageBuffer = '';

  private readonly decoder: Decoder;
  private readonly encoder: Encoder;

  /**
   * The current receive timeout ID, if any.
   * @private
   */
  private receiveTimeoutHandler?: number;

  /**
   * The current connection stability timeout ID, if any.
   *
   * @private
   */
  private unstableTimeoutHandler?: number;

  /**
   * The current connection stability test ping interval ID, if any. This
   * will only be set upon successful connection.
   *
   * @private
   */
  private pingIntervalHandler?: number;

  /**
   * Arbitrary integer, unique for each tunnel read request.
   * @private
   */
  private requestId = 0;

  private readRequest?: HttpRequest;
  private nextReadRequest?: HttpRequest;

  /*
   * @constructor
   *
   * @param tunnelURL - The URL of the HTTP tunneling service.
   */
  constructor(private readonly client: GuacamoleHttpClient) {
    super();
    this.encoder = new Encoder();

    this.decoder = new Decoder();
    this.decoder.oninstruction = (opcode, params) => {
      if (this.oninstruction !== null) {
        this.oninstruction(opcode, params);
      }
    };

    // Abort read request on INTERNAL_DATA_OPCODE
    this.decoder.addInstructionListener(INTERNAL_DATA_OPCODE, () => {
      if (this.readRequest === undefined) {
        return;
      }

      this.readRequest.abort();

      this.readRequest = this.nextReadRequest;
      this.nextReadRequest = undefined;
    });
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

    // Add message to buffer
    this.outputMessageBuffer += message;

    // Send if not currently sending
    if (!this.sendingMessages) {
      this.sendPendingMessages();
    }
  }

  public connect(data?: string) {
    // Start waiting for connect
    this.resetTimeout();

    // Mark the tunnel as connecting
    this.setState(TunnelState.CONNECTING);

    // Start tunnel and connect
    this.makeConnectRequest(data);
  }

  public disconnect() {
    this.closeTunnel();
  }

  /**
   * Initiates a timeout which, if data is not received, causes the tunnel
   * to close with an error.
   *
   * @private
   */
  private resetTimeout() {
    // Get rid of old timeouts (if any)
    clearTimeout(this.receiveTimeoutHandler);
    clearTimeout(this.unstableTimeoutHandler);

    // Clear unstable status
    if (this.state === TunnelState.UNSTABLE) {
      this.setState(TunnelState.OPEN);
    }

    // Set new timeout for tracking overall connection timeout
    this.receiveTimeoutHandler = setTimeout(() => {
      this.closeTunnel(new UpstreamTimeoutError('Server timeout.'));
    }, this.receiveTimeout);

    // Set new timeout for tracking suspected connection instability
    this.unstableTimeoutHandler = setTimeout(() => {
      this.setState(TunnelState.UNSTABLE);
    }, this.unstableThreshold);
  }

  /**
   * Closes this tunnel, signaling the given status and corresponding
   * message, which will be sent to the onerror handler if the status is
   * an error status.
   *
   * @private
   * @param error - The status causing the connection to close;
   */
  private closeTunnel(error?: TunnelError) {
    // Get rid of old timeouts (if any)
    window.clearTimeout(this.receiveTimeoutHandler);
    window.clearTimeout(this.unstableTimeoutHandler);

    // Cease connection test pings
    window.clearInterval(this.pingIntervalHandler);

    // Ignore if already closed
    if (this.state === TunnelState.CLOSED) {
      return;
    }

    // If connection closed abnormally, signal error.
    if (error !== undefined && this.onerror !== null) {
      // Ignore RESOURCE_NOT_FOUND if we've already connected, as that
      // only signals end-of-stream for the HTTP tunnel.
      if (
        this.state === TunnelState.CONNECTING ||
        error instanceof ResourceNotFoundError
      ) {
        this.onerror(error);
      }
    }

    // Reset output message buffer
    this.sendingMessages = false;

    // Mark as closed
    this.setState(TunnelState.CLOSED);
  }

  private handleOnError(req: XMLHttpRequest) {
    // Pull status code directly from headers provided by Guacamole
    const header = req.getResponseHeader('guacamole-status-code');
    if (header === null) {
      // Otherwise, assume server is unreachable
      this.closeTunnel(new UpstreamNotFoundError());
      return;
    }

    const code = parseInt(header, 10);
    if (code) {
      const message = req.getResponseHeader('guacamole-error-message');
      this.closeTunnel(new HttpGuacamoleError(code, message ?? undefined));
    } else if (req.status) {
      // Failing that, derive a TunnelError from the HTTP status
      // code provided by the browser
      this.closeTunnel(errorFromHTTPCode(req.status, req.statusText));
    } else {
      // Otherwise, assume server is unreachable
      this.closeTunnel(new UpstreamNotFoundError());
    }
  }

  private handleOnReadResponse(req: XMLHttpRequest, previousLength: number) {
    if (!this.isConnected()) {
      return;
    }

    this.resetTimeout();

    // Start next request as soon as possible, if request was successful
    if (this.nextReadRequest === undefined) {
      this.nextReadRequest = this.makeReadRequest(this.uuid, this.requestId++);
    }

    const chunk = req.responseText.slice(previousLength);
    this.decoder.receive(chunk);
  }

  private sendPendingMessages() {
    // Do not attempt to send messages if not connected
    if (!this.isConnected()) {
      return;
    }

    if (this.outputMessageBuffer.length > 0) {
      this.sendingMessages = true;

      this.makeWriteRequest(this.uuid, this.outputMessageBuffer);

      this.outputMessageBuffer = ''; // Clear buffer
    } else {
      this.sendingMessages = false;
    }
  }

  private makeConnectRequest(data: any): HttpRequest {
    const connectRequest = this.client.connect(data);
    connectRequest.onComplete = (req: XMLHttpRequest) => {
      this.resetTimeout();

      // Get UUID from response
      this.setUUID(req.responseText);

      // Mark as open
      this.setState(TunnelState.OPEN);

      // Ping tunnel endpoint regularly to test connection stability
      this.pingIntervalHandler = setInterval(() => {
        this.sendMessage(...ClientControl.nop());
      }, PING_FREQUENCY);

      // Start reading data
      this.readRequest = this.makeReadRequest(this.uuid, this.requestId++);
    };
    connectRequest.onError = (req: XMLHttpRequest) => this.handleOnError(req);
    connectRequest.send();

    return connectRequest;
  }

  private makeReadRequest(uuid: string | null, requestId: number): HttpRequest {
    const readRequest = this.client.read(String(uuid), requestId);
    readRequest.onLoading = (req: XMLHttpRequest, previousLength: number) =>
      this.handleOnReadResponse(req, previousLength);
    readRequest.onComplete = (req: XMLHttpRequest, previousLength: number) =>
      this.handleOnReadResponse(req, previousLength);
    readRequest.onError = (req: XMLHttpRequest) => this.handleOnError(req);
    readRequest.send();

    return readRequest;
  }

  private makeWriteRequest(
    uuid: string | null,
    outputMessageBuffer: string,
  ): HttpRequest {
    const writeRequest = this.client.write(String(uuid), outputMessageBuffer);
    writeRequest.onComplete = (_: XMLHttpRequest) => {
      this.resetTimeout();
      this.sendPendingMessages();
    };
    writeRequest.onError = (req: XMLHttpRequest) => this.handleOnError(req);
    writeRequest.send();

    return writeRequest;
  }
}
