/* eslint-disable @typescript-eslint/naming-convention */
import {Status, StatusCode} from './Status';
import {State} from './state';
import AbstractTunnel, {Tunnel} from './tunnel';
import { Encoder } from "@guacamole-client/protocol";

/**
 * The number of milliseconds to wait between connection stability test
 * pings.
 *
 * @private
 * @constant
 */
const PING_FREQUENCY = 500;

/**
 * Guacamole Tunnel implemented over HTTP via XMLHttpRequest.
 */
export default class HTTPTunnel extends AbstractTunnel implements Tunnel {
  // Default to polling - will be turned off automatically if not needed
  private polling = true;

  private sendingMessages = false;
  private outputMessageBuffer = '';

  // Tunnel depends on will only be sent if withCredentials is true
  private readonly withCredentials: boolean;

  // If requests are expected to be cross-domain, the cookie that the HTTP
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
   * Additional headers to be sent in tunnel requests. This dictionary can be
   * populated with key/value header pairs to pass information such as authentication
   * tokens, etc.
   *
   * @private
   */
  private readonly extraHeaders: Record<string, string>;
  /**
   * Arbitrary integer, unique for each tunnel read request.
   * @private
   */
  private requestId = 0;

  /*
   * @constructor
   *
   * @param tunnelURL - The URL of the HTTP tunneling service.
   *
   * @param [crossDomain=false]
   *     Whether tunnel requests will be cross-domain, and thus must use CORS
   *     mechanisms and headers. By default, it is assumed that tunnel requests
   *     will be made to the same domain.
   *
   * @param [extraTunnelHeaders={}]
   *     Key value pairs containing the header names and values of any additional
   *     headers to be sent in tunnel requests. By default, no extra headers will
   *     be added.
   */
  constructor(private readonly tunnelURL: string, crossDomain = false, extraTunnelHeaders: Record<string, string> = {}) {
    super();
    this.withCredentials = crossDomain;
    this.extraHeaders = extraTunnelHeaders;
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
    const message = encoder.encode(opcode, ...params);

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
    this.setState(State.CONNECTING);

    // Start tunnel and connect
    const connect_xmlhttprequest = new XMLHttpRequest();
    connect_xmlhttprequest.onreadystatechange = () => {

      if (connect_xmlhttprequest.readyState !== 4) {
        return;
      }

      // If failure, throw error
      if (connect_xmlhttprequest.status !== 200) {
        this.handleHTTPTunnelError(connect_xmlhttprequest);
        return;
      }

      this.resetTimeout();

      // Get UUID from response
      this.setUUID(connect_xmlhttprequest.responseText);

      // Mark as open
      this.setState(State.OPEN);

      // Ping tunnel endpoint regularly to test connection stability
      this.pingIntervalHandler = window.setInterval(() => {
        this.sendMessage('nop');
      }, PING_FREQUENCY);

      // Start reading data
      this.handleResponse(this.makeRequest());
    };

    connect_xmlhttprequest.open('POST', `${this.tunnelURL}?connect`, true);
    connect_xmlhttprequest.withCredentials = this.withCredentials;
    this.addExtraHeaders(connect_xmlhttprequest, this.extraHeaders);
    connect_xmlhttprequest.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=UTF-8');
    connect_xmlhttprequest.send(data);
  }

  public disconnect() {
    this.closeTunnel(new Status(StatusCode.SUCCESS, 'Manually closed.'));
  }

  /**
   * Adds the configured additional headers to the given request.
   *
   * @param {XMLHttpRequest} request
   *     The request where the configured extra headers will be added.
   *
   * @param {Object} headers
   *     The headers to be added to the request.
   *
   * @private
   */
  private addExtraHeaders(request: XMLHttpRequest, headers: Record<string, string>) {
    // TODO Review the following lint suppression
    // eslint-disable-next-line guard-for-in
    for (const name in headers) {
      request.setRequestHeader(name, headers[name]);
    }
  }

  /**
   * Initiates a timeout which, if data is not received, causes the tunnel
   * to close with an error.
   *
   * @private
   */
  private resetTimeout() {
    // Get rid of old timeouts (if any)
    window.clearTimeout(this.receiveTimeoutHandler);
    window.clearTimeout(this.unstableTimeoutHandler);

    // Clear unstable status
    if (this.state === State.UNSTABLE) {
      this.setState(State.OPEN);
    }

    // Set new timeout for tracking overall connection timeout
    this.receiveTimeoutHandler = window.setTimeout(() => {
      this.closeTunnel(new Status(StatusCode.UPSTREAM_TIMEOUT, 'Server timeout.'));
    }, this.receiveTimeout);

    // Set new timeout for tracking suspected connection instability
    this.unstableTimeoutHandler = window.setTimeout(() => {
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
    window.clearTimeout(this.receiveTimeoutHandler);
    window.clearTimeout(this.unstableTimeoutHandler);

    // Cease connection test pings
    window.clearInterval(this.pingIntervalHandler);

    // Ignore if already closed
    if (this.state === State.CLOSED) {
      return;
    }

    // If connection closed abnormally, signal error.
    if (status.code !== StatusCode.SUCCESS && this.onerror !== null) {
      // Ignore RESOURCE_NOT_FOUND if we've already connected, as that
      // only signals end-of-stream for the HTTP tunnel.
      if (this.state === State.CONNECTING
        || status.code !== StatusCode.RESOURCE_NOT_FOUND) {
        this.onerror(status);
      }
    }

    // Reset output message buffer
    this.sendingMessages = false;

    // Mark as closed
    this.setState(State.CLOSED);
  }

  private sendPendingMessages() {
    // Do not attempt to send messages if not connected
    if (!this.isConnected()) {
      return;
    }

    if (this.outputMessageBuffer.length > 0) {
      this.sendingMessages = true;

      const message_xmlhttprequest = new XMLHttpRequest();
      message_xmlhttprequest.open('POST', `${this.tunnelURL}?write:${String(this.uuid)}`);
      message_xmlhttprequest.withCredentials = this.withCredentials;
      this.addExtraHeaders(message_xmlhttprequest, this.extraHeaders);
      message_xmlhttprequest.setRequestHeader('Content-type', 'application/octet-stream');

      // Once response received, send next queued event.
      message_xmlhttprequest.onreadystatechange = () => {
        if (message_xmlhttprequest.readyState === 4) {
          this.resetTimeout();

          if (message_xmlhttprequest.status === 200) {
            // Continue the send loop
            this.sendPendingMessages();
          } else {
            // Otherwise if an error occurs during send, handle it
            this.handleHTTPTunnelError(message_xmlhttprequest);
          }
        }
      };

      message_xmlhttprequest.send(this.outputMessageBuffer);
      this.outputMessageBuffer = ''; // Clear buffer
    } else {
      this.sendingMessages = false;
    }
  }

  private handleHTTPTunnelError(xmlhttprequest: XMLHttpRequest) {
    // Pull status code directly from headers provided by Guacamole
    const header = xmlhttprequest.getResponseHeader('Guacamole-Status-Code');
    if (header === null) {
      // Otherwise, assume server is unreachable
      this.closeTunnel(new Status(StatusCode.UPSTREAM_NOT_FOUND));
      return;
    }

    const code = parseInt(header, 10);
    if (code) {
      const message = xmlhttprequest.getResponseHeader('Guacamole-Error-Message');
      this.closeTunnel(new Status(code, message ?? undefined));
    } else if (xmlhttprequest.status) {
      // Failing that, derive a Guacamole status code from the HTTP status
      // code provided by the browser
      this.closeTunnel(new Status(
        // TODO Review the following lint suppression
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        StatusCode.fromHTTPCode(xmlhttprequest.status),
        xmlhttprequest.statusText));
    } else {
      // Otherwise, assume server is unreachable
      this.closeTunnel(new Status(StatusCode.UPSTREAM_NOT_FOUND));
    }
  }

  private handleResponse(xmlhttprequest: XMLHttpRequest) {
    let interval: number | undefined;
    let nextRequest: XMLHttpRequest | undefined;

    let dataUpdateEvents = 0;

    // The location of the last element's terminator
    let elementEnd = -1;

    // Where to start the next length search or the next element
    let startIndex = 0;

    // Parsed elements
    const elements: string[] = [];

    const parseResponse = () => {
      // Do not handle responses if not connected
      if (!this.isConnected()) {
        // Clean up interval if polling
        if (interval) {
          window.clearInterval(interval);
        }

        return;
      }

      // Do not parse response yet if not ready
      if (xmlhttprequest.readyState < 2) {
        return;
      }

      // Attempt to read status
      let status: number;
      try {
        status = xmlhttprequest.status;
      } catch (_: unknown) {
        // If status could not be read, assume successful.
        status = 200;
      }

      // Start next request as soon as possible IF request was successful
      if (!nextRequest && status === 200) {
        nextRequest = this.makeRequest();
      }

      // Parse stream when data is received (LOADING<3>) and when complete (DONE<4>).
      if (xmlhttprequest.readyState !== 3 && xmlhttprequest.readyState !== 4) {
        return;
      }

      this.resetTimeout();

      // Also poll every 30ms (some browsers don't repeatedly call onreadystatechange for new data)
      if (this.polling) {
        if (xmlhttprequest.readyState === 3 && !interval) {
          interval = window.setInterval(parseResponse, 30);
        } else if (xmlhttprequest.readyState === 4 && interval) {
          clearInterval(interval);
        }
      }

      // If canceled, stop transfer
      if (xmlhttprequest.status === 0) {
        this.disconnect();
        return;
      }

      // Halt on error during request
      if (xmlhttprequest.status !== 200) {
        this.handleHTTPTunnelError(xmlhttprequest);
        return;
      }

      // Attempt to read in-progress data
      let current: string;
      try {
        current = xmlhttprequest.responseText;
      } catch (_: unknown) {
        // Do not attempt to parse if data could not be read
        return;
      }

      // While search is within currently received data
      while (elementEnd < current.length) {
        // If we are waiting for element data
        if (elementEnd >= startIndex) {
          // We now have enough data for the element. Parse.
          const element = current.substring(startIndex, elementEnd);
          const terminator = current.substring(elementEnd, elementEnd + 1);

          // Add element to array
          elements.push(element);

          // If last element, handle instruction
          if (terminator === ';') {
            // Get opcode
            const opcode = elements.shift();

            if (opcode === undefined) {
              throw new Error('Opcode not found');
            }

            // Call instruction handler.
            if (this.oninstruction !== null) {
              this.oninstruction(opcode, elements);
            }

            // Clear elements
            elements.length = 0;
          }

          // Start searching for length at character after
          // element terminator
          startIndex = elementEnd + 1;
        }

        // Search for end of length
        const lengthEnd = current.indexOf('.', startIndex);
        if (lengthEnd === -1) {
          // If no period yet, continue search when more data
          // is received
          startIndex = current.length;
          break;
        } else {
          // Parse length
          const length = parseInt(current.substring(elementEnd + 1, lengthEnd), 10);

          // If we're done parsing, handle the next response.
          if (length === 0) {
            // Clean up interval if polling
            if (interval) {
              window.clearInterval(interval);
            }

            // Clean up object
            xmlhttprequest.onreadystatechange = null;
            xmlhttprequest.abort();

            // Start handling next request
            if (nextRequest) {
              this.handleResponse(nextRequest);
            }

            // Done parsing
            break;
          }

          // Calculate start of element
          startIndex = lengthEnd + 1;

          // Calculate location of element terminator
          elementEnd = startIndex + length;
        }
      } // End parse loop
    };

    // If response polling enabled, attempt to detect if still
    // necessary (via wrapping parseResponse())
    if (this.polling) {
      xmlhttprequest.onreadystatechange = () => {
        // If we receive two or more readyState==LOADING(3) events,
        // there is no need to poll.
        if (xmlhttprequest.readyState === 3) {
          dataUpdateEvents++;
          if (dataUpdateEvents >= 2) {
            this.polling = false;
            xmlhttprequest.onreadystatechange = parseResponse;
          }
        }

        parseResponse();
      };
    } else {
      // Otherwise, just parse
      xmlhttprequest.onreadystatechange = parseResponse;
    }

    parseResponse();
  }

  private makeRequest(): XMLHttpRequest {
    // Make request, increment request ID
    const xmlhttprequest = new XMLHttpRequest();
    xmlhttprequest.open('GET', `${this.tunnelURL}?read:${String(this.uuid)}:${this.requestId++}`, true);
    xmlhttprequest.withCredentials = this.withCredentials;
    this.addExtraHeaders(xmlhttprequest, this.extraHeaders);
    xmlhttprequest.send(null);

    return xmlhttprequest;
  }
}
