import {
  ClientBadRequestError,
  ClientForbiddenError,
  ClientTooManyError,
  ResourceNotFoundError,
  ServerBusyError,
  TunnelError, UpstreamNotFoundError, UpstreamUnavailableError
} from '@guacamole-client/tunnel';


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

  /**
   * @constructor
   *
   * @param code - The Guacamole status code, as defined by StatusCode.
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
    return this.code < 0 || this.code > 0x00FF;
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
  SESSION_TIMEOUT = 0x020A,

  /**
   * The session within the upstream server has been forcibly terminated.
   */
  SESSION_CLOSED = 0x020B,

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
  CLIENT_OVERRUN = 0x030D,

  /**
   * The client sent data of an unsupported or unexpected type.
   */
  CLIENT_BAD_TYPE = 0x030F,

  /**
   * The operation failed because the current client is already using too
   * many resources.
   */
  CLIENT_TOO_MANY = 0x031D,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace StatusCode {

  export function fromTunnelError(error?: TunnelError): StatusCode {
    if (error instanceof ClientBadRequestError) {
      return StatusCode.CLIENT_BAD_REQUEST;
    } else if (error instanceof ClientForbiddenError) {
      return StatusCode.CLIENT_FORBIDDEN;
    } else if (error instanceof ResourceNotFoundError) {
      return StatusCode.RESOURCE_NOT_FOUND;
    } else if (error instanceof ClientTooManyError) {
      return StatusCode.CLIENT_TOO_MANY;
    } else if (error instanceof ServerBusyError) {
      return StatusCode.SERVER_BUSY;
    } else if (error instanceof UpstreamNotFoundError) {
      return StatusCode.UPSTREAM_NOT_FOUND;
    } else if (error instanceof UpstreamUnavailableError) {
      return StatusCode.UPSTREAM_UNAVAILABLE;
    } else {
      return StatusCode.SERVER_ERROR;
    }
  }
}
