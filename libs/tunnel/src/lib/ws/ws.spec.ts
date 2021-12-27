import * as faker from 'faker';

import { WS } from '@guacamole-client/io';

import { PING_FREQUENCY, WebSocketCloseError, WebSocketTunnel } from './ws';

import { TunnelState } from '../state';
import { ServerError, UpstreamNotFoundError, UpstreamTimeoutError } from '../errors';

const mockWs = () => ({
  connect: jest.fn(),
  onclose: null,
  onerror: null,
  onmessage: null,
  onopen: null,
  close: jest.fn(),
  send: jest.fn()
});

describe('WebSocketTunnel', () => {
  let ws: WS;
  let baseUrl: string;

  beforeEach(() => {
    jest.useFakeTimers();

    ws = mockWs() as unknown as WS;
    baseUrl = faker.internet.url();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should set listeners on create', () => {
      // When
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      // Then
      expect(tunnel.state).toBe(TunnelState.CONNECTING);
      expect(tunnel.isConnected()).toBeFalsy();

      expect(ws.onclose).not.toBeNull();
      expect(ws.onerror).toBeNull();
      expect(ws.onmessage).not.toBeNull();
      expect(ws.onopen).not.toBeNull();
    });

    it('should connect to base url without connect data', () => {
      // Given
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      // When
      tunnel.connect();

      // Then
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.connect).toHaveBeenLastCalledWith(new URL(baseUrl), 'guacamole');
    });

    it('should connect to base url w/ connect data string', () => {
      // Given
      const token = faker.internet.password(30);
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      // When
      tunnel.connect(`?token=${token}`);

      // Then
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.connect).toHaveBeenLastCalledWith(new URL(`${baseUrl}/?token=${token}`), 'guacamole');
    });

    it('should connect to base url w/ connect data URLSearchParams', () => {
      // Given
      const token = faker.internet.password(30);
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      const searchParams = new URLSearchParams();
      searchParams.append('token', token);

      // When
      tunnel.connect(searchParams);

      // Then
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.connect).toHaveBeenLastCalledWith(new URL(`${baseUrl}/?token=${token}`), 'guacamole');
    });

    it('should be connected after getting uuid', () => {
      // Given
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      // When
      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      // Then
      expect(tunnel.state).toBe(TunnelState.OPEN);
    });
  });

  describe('ping', () => {
    it('should send a ping message endpoint regularly', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      jest.advanceTimersByTime(PING_FREQUENCY);
      jest.advanceTimersByTime(PING_FREQUENCY);

      /* Then */
      expect(ws.send).toHaveBeenCalledTimes(2);
      expect(ws.send).toHaveBeenLastCalledWith(expect.stringMatching(/^0\.,4\.ping,\d+.\d+;$/));
    });
  });

  describe('sendMessage', () => {
    it('should send message when connected', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const message = faker.hacker.verb();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      tunnel.sendMessage(message);

      /* Then */
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(ws.send).toHaveBeenLastCalledWith(`${message.length}.${message};`);
    });

    it('should not send message if not connected', () => {
      // Given
      const message = faker.lorem.word(20);
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      // When
      tunnel.sendMessage(message);

      // Then
      expect(ws.connect).toHaveBeenCalledTimes(0);
      expect(ws.send).toHaveBeenCalledTimes(0);
    });

    it('should not send empty message', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      tunnel.sendMessage();

      /* Then */
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.send).toHaveBeenCalledTimes(0);
    });
  });

  describe('timeouts', () => {
    it('should be marked as unstable', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      // Get UUID
      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      jest.advanceTimersByTime(tunnel.unstableThreshold);

      /* Then */
      expect(tunnel.state).toBe(TunnelState.UNSTABLE);
    });

    it('should be marked as open (after unstable)', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      jest.advanceTimersByTime(tunnel.unstableThreshold);
      // tunnel.state => UNSTABLE
      jest.advanceTimersByTime(50);
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `3.nop;` } as MessageEvent<string>);
      }

      /* Then */
      expect(tunnel.state).toBe(TunnelState.OPEN);
    });

    it('should close and error out on receive timeout', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);
      tunnel.onerror = jest.fn();

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      jest.advanceTimersByTime(tunnel.receiveTimeout);

      /* Then */
      expect(tunnel.state).toBe(TunnelState.CLOSED);
      expect(tunnel.isConnected()).toBeFalsy();

      expect(tunnel.onerror).toHaveBeenCalledTimes(1);
      expect(tunnel.onerror).toHaveBeenLastCalledWith(new UpstreamTimeoutError('Server timeout.'));
    });
  });

  describe('onerror', () => {
    it('on socket close event with reason', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);
      tunnel.onerror = jest.fn();

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      const event = { reason: String(faker.datatype.number(9) * 1000) };
      if (ws.onclose !== null) {
        ws.onclose(event as unknown as CloseEvent);
      }

      /* Then */
      expect(tunnel.state).toBe(TunnelState.CLOSED);

      expect(tunnel.onerror).toHaveBeenLastCalledWith(new WebSocketCloseError(event.reason));
    });

    it('on socket close event with code', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);
      tunnel.onerror = jest.fn();

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      const event = { code: 5000 };
      if (ws.onclose !== null) {
        ws.onclose(event as unknown as CloseEvent);
      }

      /* Then */
      expect(tunnel.state).toBe(TunnelState.CLOSED);

      expect(tunnel.onerror).toHaveBeenLastCalledWith(new ServerError());
    });

    it('on socket close event when server unreachable', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);
      tunnel.onerror = jest.fn();

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      if (ws.onclose !== null) {
        ws.onclose({} as unknown as CloseEvent);
      }

      /* Then */
      expect(tunnel.state).toBe(TunnelState.CLOSED);

      expect(tunnel.onerror).toHaveBeenLastCalledWith(new UpstreamNotFoundError());
    });
  });

  describe('disconnect', () => {
    it('should disconnect when connected', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      /* When */
      tunnel.disconnect();

      /* Then */
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.close).toHaveBeenCalledTimes(1);

      expect(tunnel.state).toBe(TunnelState.CLOSED);
    });

    it('should disconnect when already disconnected', () => {
      /* Given */
      const uuid = faker.datatype.uuid();
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      tunnel.connect();

      if (ws.onopen !== null) {
        ws.onopen({} as Event);
      }
      if (ws.onmessage !== null) {
        ws.onmessage({ data: `0.,${uuid.length}.${uuid};` } as MessageEvent<string>);
      }

      tunnel.disconnect();

      /* When */
      tunnel.disconnect();

      /* Then */
      expect(ws.connect).toHaveBeenCalledTimes(1);
      expect(ws.close).toHaveBeenCalledTimes(1);

      expect(tunnel.state).toBe(TunnelState.CLOSED);
    });

    it('should disconnect when not connected', () => {
      /* Given */
      const tunnel = new WebSocketTunnel(ws as WS, baseUrl);

      /* When */
      tunnel.disconnect();

      /* Then */
      expect(ws.connect).toHaveBeenCalledTimes(0);
      expect(ws.close).toHaveBeenCalledTimes(1);

      expect(tunnel.state).toBe(TunnelState.CLOSED);
    });
  });
});
