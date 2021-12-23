/* eslint-disable @typescript-eslint/naming-convention */

import {Status} from './Status';
import {State} from './state';

export type OnUuidCallback = (uuid: string) => void;
export type OnErrorCallback = (status: Status) => void;
export type OnStateChangeCallback = (state: State) => void;
export type OnInstructionCallback = (opcode: string, parameters: string[]) => void;

/**
 * The Guacamole protocol instruction opcode reserved for arbitrary internal
 * use by tunnel implementations. The value of this opcode is guaranteed to be
 * the empty string (""). Tunnel implementations may use this opcode for any
 * purpose. It is currently used by the HTTP tunnel to mark the end of the HTTP
 * response, and by the WebSocket tunnel to transmit the tunnel UUID and send
 * connection stability test pings/responses.
 *
 * @constant
 */
export const INTERNAL_DATA_OPCODE = '';

export interface Tunnel {
  uuid: string | null;
  onuuid: OnUuidCallback | null;
  onerror: OnErrorCallback | null;
  onstatechange: OnStateChangeCallback | null;
  oninstruction: OnInstructionCallback | null;

  isConnected(): boolean;

  connect(data?: string): void;

  disconnect(): void;

  sendMessage(...elements: any[]): void;
}

/**
 * Core object providing abstract communication for  This object
 * is a null implementation whose functions do nothing. Guacamole applications
 * should use {@link HTTPTunnel} instead, or implement their own tunnel based
 * on this one.
 */
export default abstract class AbstractTunnel implements Tunnel {
  /**
   * The UUID uniquely identifying this tunnel. If not yet known, this will
   * be null.
   */
  public uuid: string | null = null;

  /**
   * Fired when the UUID that uniquely identifies this tunnel is known.
   *
   * @event
   * @param uuid - The UUID uniquely identifying this tunnel.
   */
  public onuuid: OnUuidCallback | null = null;

  /**
   * Fired whenever an error is encountered by the tunnel.
   *
   * @event
   * @param status - A status object which describes the error.
   */
  public onerror: OnErrorCallback | null = null;

  /**
   * Fired whenever the state of the tunnel changes.
   *
   * @event
   * @param state - The new state of the client.
   */
  public onstatechange: OnStateChangeCallback | null = null;

  /**
   * Fired once for every complete Guacamole instruction received, in order.
   *
   * @event
   * @param opcode - The Guacamole instruction opcode.
   * @param parameters - The parameters provided for the instruction,
   *                     if any.
   */
  public oninstruction: OnInstructionCallback | null = null;

  /**
   * The current state of this tunnel.
   *
   * @type {State}
   */
  protected state: State = State.CONNECTING;

  /**
   * The maximum amount of time to wait for data to be received, in
   * milliseconds. If data is not received within this amount of time,
   * the tunnel is closed with an error. The default value is 15000.
   */
  protected receiveTimeout = 15000;

  /**
   * The amount of time to wait for data to be received before considering
   * the connection to be unstable, in milliseconds. If data is not received
   * within this amount of time, the tunnel status is updated to warn that
   * the connection appears unresponsive and may close. The default value is
   * 1500.
   */
  protected unstableThreshold = 1500;

  /**
   * Returns whether this tunnel is currently connected.
   *
   * @returns true if this tunnel is currently connected, false otherwise.
   */
  public isConnected(): boolean {
    return this.state === State.OPEN || this.state === State.UNSTABLE;
  }

  /**
   * Connect to the tunnel with the given optional data. This data is
   * typically used for authentication. The format of data accepted is
   * up to the tunnel implementation.
   *
   * @param data - The data to send to the tunnel when connecting.
   */
  public abstract connect(data?: string): void;

  /**
   * Disconnect from the tunnel.
   */
  public abstract disconnect(): void;

  /**
   * Send the given message through the tunnel to the service on the other
   * side. All messages are guaranteed to be received in the order sent.
   *
   * @param elements - The elements of the message to send to the service on
   *                   the other side of the tunnel.
   */
  public abstract sendMessage(...elements: any[]): void;

  /**
   * Changes the stored numeric state of this tunnel, firing the onstatechange
   * event if the new state is different and a handler has been defined.
   *
   * @private
   * @param state - The new state of this tunnel.
   */
  protected setState(state: State) {
    // Notify only if state changes
    if (state !== this.state) {
      this.state = state;
      if (this.onstatechange !== null) {
        this.onstatechange(state);
      }
    }
  }

  /**
   * Changes the stored UUID that uniquely identifies this tunnel, firing the
   * onuuid event if a handler has been defined.
   *
   * @private
   * @param uuid - The new state of this tunnel.
   */
  protected setUUID(uuid: string) {
    this.uuid = uuid;
    if (this.onuuid !== null) {
      this.onuuid(uuid);
    }
  }
}
