export { default as Decoder } from "./lib/codec/decoder";
export { default as Encoder } from "./lib/codec/encoder";

export type {InstructionElements} from "./lib/instructions/instructionElements";
export * as ClientControl from "./lib/instructions/client-control";
export * as ClientEvents from "./lib/instructions/client-events";
export * as ClientHandshake from "./lib/instructions/client-handshake";
// export * as Drawing from "./lib/instructions/drawing";
export * as ObjectInstruction from "./lib/instructions/object-instruction";
export * as ServerControl from "./lib/instructions/server-control";
export * as ServerHandshake from "./lib/instructions/server-handshake";
export * as Streaming from "./lib/instructions/streaming";

export type {DrawingInstructionHandlers } from './lib/instructions/drawing';
