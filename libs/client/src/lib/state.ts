/*
 * Client state
 */
export enum State {
  IDLE = 0,
  CONNECTING = 1,
  WAITING = 2,
  CONNECTED = 3,
  DISCONNECTING = 4,
  DISCONNECTED = 5,
}
