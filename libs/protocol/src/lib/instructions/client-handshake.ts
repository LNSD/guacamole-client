import { createInstruction } from './instruction';

const AUDIO_OPCODE = 'audio';
const CONNECT_OPCODE = 'connect';
const IMAGE_OPCODE = 'image';
const SELECT_OPCODE = 'select';
const SIZE_OPCODE = 'size';
const TIMEZONE_OPCODE = 'timezone';
const VIDEO_OPCODE = 'video';
/**
 * Specifies which audio mimetypes are supported by the client. Each parameter must be a single
 * mimetype, listed in order of client preference, with the optimal mimetype being the first
 * parameter.
 *
 * @param mimetype - Audio mimetypes are supported by the client.
 */
export type AudioHandler = (...mimetype: string[]) => void;

export const audio = createInstruction<AudioHandler>(AUDIO_OPCODE,
  (...mimetype: string[]) => [...mimetype],
  (handler: AudioHandler) => (params) => {},
);


/**
 * Begins the connection using the previously specified protocol with the given arguments. This is
 * the last instruction sent during the handshake phase.
 *
 * The parameters of this instruction correspond exactly to the parameters of the received args
 * instruction. If the received args instruction has, for example, three parameters, the responding
 * connect instruction must also have three parameters.
 */
export type ConnectHandler = (...params: string[]) => void;

export const connect = createInstruction<ConnectHandler>(CONNECT_OPCODE,
  (...params: string[]) => [...params],
  (handler: ConnectHandler) => (params) => {},
);


/**
 * Specifies which image mimetypes are supported by the client. Each parameter must be a single
 * mimetype, listed in order of client preference, with the optimal mimetype being the first
 * parameter.
 *
 * It is expected that the supported mimetypes will include at least "image/png" and "image/jpeg",
 * and the server may safely assume that these mimetypes are supported, even if they are absent
 * from the handshake.
 *
 * @param mimetype - Image mimetypes are supported by the client
 */
export type ImageHandler = (...mimetype: string[]) => void;

export const image = createInstruction<ImageHandler>(IMAGE_OPCODE,
  (...mimetype: string[]) => [...mimetype],
  (handler: ImageHandler) => (params) => {},
);


/**
 * Requests that the connection be made using the specified protocol, or to the specified existing
 * connection. Whether a new connection is established or an existing connection is joined depends
 * on whether the ID of an active connection is provided. The Guacamole protocol dictates that the
 * IDs generated for active connections (provided during the handshake of those connections via the
 * ready instruction) must not collide with any supported protocols.
 *
 * This is the first instruction sent during the handshake phase.
 *
 * @param id - The name of the protocol to use, such as "vnc" or "rdp", or the ID of the active
 *             connection to be joined, as returned via the ready instruction.
 */
export type SelectHandler = (id: string) => void;

export const select = createInstruction<SelectHandler>(SELECT_OPCODE,
  (id: string) => [id],
  (handler: SelectHandler) => (params) => {},
);


/**
 * Specifies the client's optimal screen size and resolution.
 *
 * @param width - The optimal screen width.
 * @param height - The optimal screen height.
 * @param dpi - The optimal screen resolution, in approximate DPI.
 */
export type SizeHandler = (width: number, height: number, dpi: number) => void;

export const size = createInstruction<SizeHandler>(SIZE_OPCODE,
  (width: number, height: number, dpi: number) => [width, height, dpi],
  (handler: SizeHandler) => (params) => {},
);


/**
 * Specifies the timezone of the client system, in IANA zone key format. This is a single-value
 * parameter, and may be used by protocols to set the timezone on the remote computer, if the
 * remote system allows the timezone to be configured. This instruction is optional.
 *
 * @param timezone - Timezone of the client system, in IANA zone key format.
 */
export type TimezoneHandler = (timezone: string) => void;

export const timezone = createInstruction<TimezoneHandler>(TIMEZONE_OPCODE,
  (timezone: string) => [timezone],
  (handler: TimezoneHandler) => (params) => {},
);


/**
 * Specifies which video mimetypes are supported by the client. Each parameter must be a single
 * mimetype, listed in order of client preference, with the optimal mimetype being the first
 * parameter.
 *
 * @param mimetypes - Video mimetypes supported by the client
 */
export type VideoHandler = (...mimetypes: string[]) => void;

export const video = createInstruction<VideoHandler>(VIDEO_OPCODE,
  (...mimetypes: string[]) => [...mimetypes],
  (handler: VideoHandler) => (params) => {},
);
