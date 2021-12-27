/* eslint-disable @typescript-eslint/no-namespace,@typescript-eslint/naming-convention,@typescript-eslint/no-unnecessary-qualifier */

/**
 * A Guacamole status. Each Guacamole status consists of a status code, defined
 * by the protocol, and an optional human-readable message, usually only
 * included for debugging convenience.
 */
export class Status {
  /**
   * The Guacamole status code.
   */
  public code: StatusCode;

  /**
   * An arbitrary human-readable message associated with this status, if any.
   * The human-readable message is not required, and is generally provided
   * for debugging purposes only. For user feedback, it is better to translate
   * the Guacamole status code into a message.
   */
  public message: string;

  /*
   * @constructor
   * @param code - The Guacamole status code, as defined by StatusCode.
   *
   * @param [message] - An optional human-readable message.
   */
  constructor(code: number, message = '') {
    this.code = code;
    this.message = message;
  }

  /**
   * Returns whether this status represents an error.
   *
   * @returns true if this status represents an error, false otherwise.
   */
  public isError(): boolean {
    return this.code < 0 || this.code > 0x00ff;
  }
}

/**
 * Enumeration of all Guacamole status codes.
 */
export enum StatusCode {
  /**
   * The operation succeeded.
   */
  SUCCESS = 0x0000,

  /**
   * The requested operation is unsupported.
   */
  UNSUPPORTED = 0x0100,

  /**
   * The operation could not be performed due to an internal failure.
   */
  SERVER_ERROR = 0x0200,

  /**
   * The operation could not be performed as the server is busy.
   */
  SERVER_BUSY = 0x0201,

  /**
   * The operation could not be performed because the upstream server is not
   * responding.
   */
  UPSTREAM_TIMEOUT = 0x0202,

  /**
   * The operation was unsuccessful due to an error or otherwise unexpected
   * condition of the upstream server.
   */
  UPSTREAM_ERROR = 0x0203,

  /**
   * The operation could not be performed as the requested resource does not
   * exist.
   */
  RESOURCE_NOT_FOUND = 0x0204,

  /**
   * The operation could not be performed as the requested resource is
   * already in use.
   */
  RESOURCE_CONFLICT = 0x0205,

  /**
   * The operation could not be performed as the requested resource is now
   * closed.
   */
  RESOURCE_CLOSED = 0x0206,

  /**
   * The operation could not be performed because the upstream server does
   * not appear to exist.
   */
  UPSTREAM_NOT_FOUND = 0x0207,

  /**
   * The operation could not be performed because the upstream server is not
   * available to service the request.
   */
  UPSTREAM_UNAVAILABLE = 0x0208,

  /**
   * The session within the upstream server has ended because it conflicted
   * with another session.
   */
  SESSION_CONFLICT = 0x0209,

  /**
   * The session within the upstream server has ended because it appeared to
   * be inactive.
   */
  SESSION_TIMEOUT = 0x020a,

  /**
   * The session within the upstream server has been forcibly terminated.
   */
  SESSION_CLOSED = 0x020b,

  /**
   * The operation could not be performed because bad parameters were given.
   */
  CLIENT_BAD_REQUEST = 0x0300,

  /**
   * Permission was denied to perform the operation, as the user is not yet
   * authorized (not yet logged in, for example).
   */
  CLIENT_UNAUTHORIZED = 0x0301,

  /**
   * Permission was denied to perform the operation, and this permission will
   * not be granted even if the user is authorized.
   */
  CLIENT_FORBIDDEN = 0x0303,

  /**
   * The client took too long to respond.
   */
  CLIENT_TIMEOUT = 0x0308,

  /**
   * The client sent too much data.
   */
  CLIENT_OVERRUN = 0x030d,

  /**
   * The client sent data of an unsupported or unexpected type.
   */
  CLIENT_BAD_TYPE = 0x030f,

  /**
   * The operation failed because the current client is already using too
   * many resources.
   */
  CLIENT_TOO_MANY = 0x031d,
}

export namespace StatusCode {
  /**
   * Returns the Guacamole protocol status code which most closely
   * represents the given HTTP status code.
   *
   * @param status - The HTTP status code to translate into a Guacamole protocol
   *                status code.
   *
   * @returns The Guacamole protocol status code which most closely represents
   *          the given HTTP status code.
   */
  export function fromHTTPCode(status?: number): StatusCode {
    // Translate status codes with known equivalents
    switch (status) {
      // HTTP 400 - Bad request
      case 400:
        return StatusCode.CLIENT_BAD_REQUEST;

      // HTTP 403 - Forbidden
      case 403:
        return StatusCode.CLIENT_FORBIDDEN;

      // HTTP 404 - Resource not found
      case 404:
        return StatusCode.RESOURCE_NOT_FOUND;

      // HTTP 429 - Too many requests
      case 429:
        return StatusCode.CLIENT_TOO_MANY;

      // HTTP 503 - Server unavailable
      case 503:
        return StatusCode.SERVER_BUSY;

      // Default all other codes to generic internal error
      default:
        return StatusCode.SERVER_ERROR;
    }
  }

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
  export function fromWebSocketCode(code: number): StatusCode {
    // Translate status codes with known equivalents
    switch (code) {
      // Successful disconnect (no error)
      case 1000: // Normal Closure
        return StatusCode.SUCCESS;

      // Codes which indicate the server is not reachable
      case 1006: // Abnormal Closure (also signalled by JavaScript when the connection cannot be opened in the first place)
      case 1015: // TLS Handshake
        return StatusCode.UPSTREAM_NOT_FOUND;

      // Codes which indicate the server is reachable but busy/unavailable
      case 1001: // Going Away
      case 1012: // Service Restart
      case 1013: // Try Again Later
      case 1014: // Bad Gateway
        return StatusCode.UPSTREAM_UNAVAILABLE;

      // Default all other codes to generic internal error
      default:
        return StatusCode.SERVER_ERROR;
    }
  }
}
