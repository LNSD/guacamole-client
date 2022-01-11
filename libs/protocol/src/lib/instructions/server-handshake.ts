import { createInstruction } from './instruction';

const ARGS_OPCODE = 'args';

/**
 * Reports the expected format of the argument list for the protocol requested by the client. This
 * message can be sent by the server during the handshake phase only.
 *
 * The first parameter of this instruction will be the protocol version supported by the server.
 * This is used to negotiate protocol compatibility between the client and the server, with the
 * highest supported protocol by both sides being chosen. Versions of Guacamole prior to 1.1.0 do
 * not support protocol version negotiation, and will silently ignore this instruction.
 *
 * The remaining parameters of the args instruction are the names of all connection parameters
 * accepted by the server for the protocol selected by the client, in order. The client's responding
 * connect instruction must contain the values of each of these parameters in the same order.
 *
 * @param version - The protocol version supported by the server.
 * @param params - The names of all connection parameters accepted by the server for the protocol
 *                 selected by the client.
 */
export type ArgsHandler = (version: string, ...params: string[]) => void;

export const args = createInstruction<ArgsHandler>(ARGS_OPCODE,
  (version: string, ...params: string[]) => [version, ...params],
  (handler: ArgsHandler) => (params) => {
    const [version, ...argsParams] = params;

    handler(version, ...argsParams)
  },
);
