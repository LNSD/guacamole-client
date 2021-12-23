/* eslint-disable @typescript-eslint/naming-convention */
import AbstractTunnel, {Tunnel} from './Tunnel';
import {Status, StatusCode} from '../Status';
import Parser from '../Parser';
import {State} from './State';

/**
 * Guacamole Tunnel which replays a Guacamole protocol dump from a static file
 * received via HTTP. Instructions within the file are parsed and handled as
 * quickly as possible, while the file is being downloaded.
 */
export default class StaticHTTPTunnel extends AbstractTunnel implements Tunnel {
  /**
   * The current, in-progress HTTP request. If no request is currently in
   * progress, this will be null.
   *
   * @private
   */
  private xhr: XMLHttpRequest | null = null;

  /**
   * Additional headers to be sent in tunnel requests. This dictionary can be
   * populated with key/value header pairs to pass information such as authentication
   * tokens, etc.
   *
   * @private
   */
  private readonly extraTunnelHeaders: Record<string, string>;

  /*
   * @constructor
   * @augments Tunnel
   * @param {String} url
   *     The URL of a Guacamole protocol dump.
   *
   * @param {Boolean} [crossDomain=false]
   *     Whether tunnel requests will be cross-domain, and thus must use CORS
   *     mechanisms and headers. By default, it is assumed that tunnel requests
   *     will be made to the same domain.
   *
   * @param {Object} [extraTunnelHeaders={}]
   *     Key value pairs containing the header names and values of any additional
   *     headers to be sent in tunnel requests. By default, no extra headers will
   *     be added.
   */
  constructor(private readonly url: string, private readonly crossDomain = false, extraTunnelHeaders: Record<string, string> = {}) {
    super();
    this.extraTunnelHeaders = extraTunnelHeaders;
  }

  public sendMessage(_elements: any[]) {
    // Do nothing
  }

  public connect(_data?: string) {
    // Ensure any existing connection is killed
    this.disconnect();

    // Connection is now starting
    this.setState(State.CONNECTING);

    // Start a new connection
    this.xhr = new XMLHttpRequest();
    this.xhr.open('GET', this.url);
    this.xhr.withCredentials = Boolean(this.crossDomain);
    this.addExtraHeaders(this.xhr, this.extraTunnelHeaders);
    this.xhr.responseType = 'text';
    this.xhr.send(null);

    let offset = 0;

    // Create Guacamole protocol parser specifically for this connection
    const parser = new Parser();

    // Invoke tunnel's oninstruction handler for each parsed instruction
    parser.oninstruction = (opcode: string, args: string[]) => {
      if (this.oninstruction !== null) {
        this.oninstruction(opcode, args);
      }
    };

    // Continuously parse received data
    this.xhr.onreadystatechange = () => {
      // Parse while data is being received
      if (this.xhr?.readyState === 3 || this.xhr?.readyState === 4) {
        // Connection is open
        this.setState(State.OPEN);

        const buffer = this.xhr.responseText;
        const {length} = buffer;

        // Parse only the portion of data which is newly received
        if (offset < length) {
          parser.receive(buffer.substring(offset));
          offset = length;
        }
      }

      // Clean up and close when done
      if (this.xhr?.readyState === 4) {
        this.disconnect();
      }
    };

    // Reset state and close upon error
    this.xhr.onerror = () => {
      // Fail if file could not be downloaded via HTTP
      if (this.onerror !== null) {
        this.onerror(new Status(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          StatusCode.fromHTTPCode(this.xhr?.status), this.xhr?.statusText));
      }

      this.disconnect();
    };
  }

  public disconnect() {
    // Abort and dispose of XHR if a request is in progress
    if (this.xhr !== null) {
      this.xhr.abort();
      this.xhr = null;
    }

    // Connection is now closed
    this.setState(State.CLOSED);
  }

  /**
   * Adds the configured additional headers to the given request.
   *
   * @param request - The request where the configured extra headers will be added.
   * @param headers - The headers to be added to the request.
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
}
