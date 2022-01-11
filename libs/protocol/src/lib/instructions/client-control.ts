import { createInstruction } from './instruction';

const DISCONNECT_OPCODE = 'disconnect';
const NOP_OPCODE = 'nop';
const SYNC_OPCODE = 'sync';

/**
 * Notifies the server that the connection is about to be closed by the client. This message can be
 * sent by the client during any phase, and takes no parameters.
 */
export type DisconnectHandler = () => void;

export const disconnect = createInstruction<DisconnectHandler>(DISCONNECT_OPCODE,
  () => [],
  (handler: DisconnectHandler) => (params) => {},
);

/**
 * The client "nop" instruction does absolutely nothing, has no parameters, and is universally
 * ignored by the Guacamole server. Its main use is as a keep-alive signal, and may be sent by
 * Guacamole clients when there is no activity to ensure the socket is not closed due to timeout.
 */
export type NopHandler = () => void;

export const nop = createInstruction<NopHandler>(NOP_OPCODE,
  () => [],
  (handler: NopHandler) => (params) => {},
);

/**
 * Reports that all operations as of the given server-relative timestamp have been completed. If a
 * sync is received from the server, the client must respond with a corresponding sync once all
 * previous operations have been completed, or the server may stop sending updates until the client
 * catches up. For the client, sending a sync with a timestamp newer than any timestamp received
 * from the server is an error.
 *
 * Both client and server are expected to occasionally send sync to report on current operation
 * execution state.
 *
 * @param timestamp - A valid server-relative timestamp.
 */
export type SyncHandler = (timestamp: number) => void;

export const sync = createInstruction<SyncHandler>(SYNC_OPCODE,
  (timestamp: number) => [timestamp],
  (handler: SyncHandler) => (params) => {},
);
