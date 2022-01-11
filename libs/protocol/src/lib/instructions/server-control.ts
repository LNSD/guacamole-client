import { createInstruction } from './instruction';

const DISCONNECT_OPCODE = 'disconnect';
const ERROR_OPCODE = 'error';
const LOG_OPCODE = 'log';
const MOUSE_OPCODE = 'mouse';
const NOP_OPCODE = 'nop';
const READY_OPCODE = 'ready';
const SYNC_OPCODE = 'sync';


/**
 * Notifies the client that the connection is about to be closed by the server. This message can be
 * sent by the server during any phase, and takes no parameters.
 */
export type DisconnectHandler = () => void;

export const disconnect = createInstruction<DisconnectHandler>(DISCONNECT_OPCODE,
  () => [],
  (handler: DisconnectHandler) => (params) => {
  }
);

/**
 * Notifies the client that the connection is about to be closed due to the specified error. This
 * message can be sent by the server during any phase.
 *
 * @param text - An arbitrary message describing the error
 * @param status - The Guacamole status code describing the error. For a list of status codes, see
 *                 the table in the section called “Status codes”.
 */
export type ErrorHandler = (text: string, status: number) => void;

export const error = createInstruction<ErrorHandler>(ERROR_OPCODE,
  (text: string, status: number) => [text, status],
  (handler: ErrorHandler) => (params) => {
  }
);

/**
 * The log instruction sends an arbitrary string for debugging purposes. This instruction will be
 * ignored by Guacamole clients, but can be seen in protocol dumps if such dumps become necessary.
 * Sending a log instruction can help add context when searching for the cause of a fault in
 * protocol support.
 *
 * @param message - An arbitrary, human-readable message.
 */
export type LogHandler = (message: string) => void;

export const log = createInstruction<LogHandler>(LOG_OPCODE,
  (message: string) => [message],
  (handler: LogHandler) => (params) => {
  }
);

/**
 * Reports that a user on the current connection has moved the mouse to the given coordinates.
 *
 * @param x - The current X coordinate of the mouse pointer.
 * @param y - The current Y coordinate of the mouse pointer.
 */
export type MouseHandler = (x: number, y: number) => void;

export const mouse = createInstruction<MouseHandler>(MOUSE_OPCODE,
  (x: number, y: number) => [x, y],
  (handler: MouseHandler) => (params) => {
  }
);


/**
 * The server "nop" instruction does absolutely nothing, has no parameters, and is universally
 * ignored by Guacamole clients. Its main use is as a keep-alive signal, and may be sent by guacd
 * or client plugins when there is no activity to ensure the socket is not closed due to timeout.
 */
export type NopHandler = () => void;

export const nop = createInstruction<NopHandler>(NOP_OPCODE,
  () => [],
  (handler: NopHandler) => (params) => {
  }
);

/**
 * The ready instruction sends the ID of a new connection and marks the beginning of the interactive
 * phase of a new, successful connection. The ID sent is a completely arbitrary string, and has no
 * standard format. It must be unique from all existing and future connections and may not match the
 * name of any installed protocol support.
 *
 * @param id - An arbitrary, unique identifier for the current connection. This identifier must be
 *             unique from all existing and future connections, and may not match the name of any
 *             installed protocol support (such as "vnc" or "rdp").
 */
export type ReadyHandler = (id: string) => void;

export const ready = createInstruction<ReadyHandler>(READY_OPCODE,
  (id: string) => [id],
  (handler: ReadyHandler) => (params) => {
  }
);


/**
 * Indicates that the given timestamp is the current timestamp as of all previous operations. The
 * client must respond to every sync instruction received.
 *
 * Both client and server are expected to occasionally send sync to report on current operation
 * execution state.
 *
 * @param timestamp - A valid server-relative timestamp.
 */
export type SyncHandler = (timestamp: number) => void;

export const sync = createInstruction<SyncHandler>(SYNC_OPCODE,
  (timestamp: number) => [timestamp],
  (handler: SyncHandler) => (params) => {
  }
);
