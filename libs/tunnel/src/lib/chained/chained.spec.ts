import * as faker from 'faker';

import { ServerError, UpstreamTimeoutError } from '../errors';
import { TunnelState } from '../state';
import { Tunnel } from '../tunnel';
import { ChainedTunnel } from './chained';

const getMockTunnel = (uuid: string | null = null): Tunnel => ({
  uuid,
  onuuid: null,
  onerror: null,
  oninstruction: null,
  onstatechange: null,
  connect: jest.fn(),
  sendMessage: jest.fn(),
  isConnected: jest.fn(),
  disconnect: jest.fn(),
});

describe('ChainedTunnel', () => {
  it('no tunnels provided', (done) => {
    const chainedTunnel = new ChainedTunnel();

    chainedTunnel.onerror = (status) => {
      expect(status).toStrictEqual(new ServerError());
      done();
    };

    chainedTunnel.connect('anything');
  });

  describe('single mock tunnel', () => {
    it('oninstruction first', () => {
      const mockTunnel = getMockTunnel();

      const chainedTunnel = new ChainedTunnel(mockTunnel);

      chainedTunnel.connect('anything');

      expect(mockTunnel.connect).toHaveBeenLastCalledWith('anything');
      expect(mockTunnel.onerror).not.toBeNull();
      expect(mockTunnel.oninstruction).not.toBeNull();
      expect(mockTunnel.onstatechange).not.toBeNull();

      if (mockTunnel.oninstruction) {
        mockTunnel.oninstruction('opcode', []);
      }
    });

    it('onstatechange first with open', () => {
      const expectedOnStateChangeCallback = (state: TunnelState) => {
        expect(state).toBe(TunnelState.OPEN);
      };

      const expectedUuid = faker.datatype.uuid();
      const mockTunnel = getMockTunnel(expectedUuid);
      const chainedTunnel = new ChainedTunnel(mockTunnel);

      chainedTunnel.onstatechange = expectedOnStateChangeCallback;

      chainedTunnel.connect('anything');

      expect(mockTunnel.connect).toHaveBeenLastCalledWith('anything');
      expect(mockTunnel.onerror).not.toBeNull();
      expect(mockTunnel.oninstruction).not.toBeNull();
      expect(mockTunnel.onstatechange).not.toBeNull();

      expect(mockTunnel.onstatechange).not.toBe(expectedOnStateChangeCallback);

      if (mockTunnel.onstatechange) {
        mockTunnel.onstatechange(TunnelState.OPEN);
      }

      expect(mockTunnel.onstatechange).toBe(expectedOnStateChangeCallback);

      expect(chainedTunnel.uuid).toBe(expectedUuid);
      expect(mockTunnel.uuid).toBe(expectedUuid);
    });

    it('onstatechange first with CLOSED', () => {
      const expectedOnStateChangeCallback = (state: TunnelState) => {
        expect(state).toBe(TunnelState.CLOSED);
      };

      const expectedUuid = faker.datatype.uuid();
      const mockTunnel = getMockTunnel(expectedUuid);
      const chainedTunnel = new ChainedTunnel(mockTunnel);

      chainedTunnel.onstatechange = expectedOnStateChangeCallback;

      chainedTunnel.connect('anything');

      expect(mockTunnel.connect).toHaveBeenLastCalledWith('anything');
      expect(mockTunnel.onerror).not.toBeNull();
      expect(mockTunnel.oninstruction).not.toBeNull();
      expect(mockTunnel.onstatechange).not.toBeNull();

      expect(mockTunnel.onstatechange).not.toBe(expectedOnStateChangeCallback);

      if (mockTunnel.onstatechange) {
        mockTunnel.onstatechange(TunnelState.CLOSED);
      }

      // TODO Should this be null?
      expect(mockTunnel.onstatechange).not.toBe(expectedOnStateChangeCallback);

      expect(chainedTunnel.uuid).toBeNull();
    });
  });

  describe('two mock tunnels', () => {
    let mockTunnelA: Tunnel;
    let mockTunnelB: Tunnel;

    beforeEach(() => {
      mockTunnelA = getMockTunnel();
      mockTunnelB = getMockTunnel();
    });

    it('onstatechange both with CLOSED', () => {
      const fakeConnectData = faker.datatype.string(10);
      const expectedOnErrorCallback = jest.fn();
      const expectedOnStateChangeCallback = (state: TunnelState) => {
        expect(state).toBe(TunnelState.CLOSED);
      };

      const chainedTunnel = new ChainedTunnel(mockTunnelA, mockTunnelB);
      chainedTunnel.onerror = expectedOnErrorCallback;
      chainedTunnel.onstatechange = expectedOnStateChangeCallback;

      chainedTunnel.connect(fakeConnectData);

      if (mockTunnelA.onstatechange) {
        mockTunnelA.onstatechange(TunnelState.CLOSED);
      }

      if (mockTunnelB.onstatechange) {
        mockTunnelB.onstatechange(TunnelState.CLOSED);
      }

      expect(mockTunnelA.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelA.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(mockTunnelB.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelB.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(chainedTunnel.onerror).not.toHaveBeenCalled();
    });

    it('onstatechange first CLOSED second OPEN', () => {
      const fakeConnectData = faker.datatype.string(10);
      const expectedOnErrorCallback = jest.fn();
      const expectedOnStateChangeCallback = jest.fn();

      const chainedTunnel = new ChainedTunnel(mockTunnelA, mockTunnelB);
      chainedTunnel.onerror = expectedOnErrorCallback;
      chainedTunnel.onstatechange = expectedOnStateChangeCallback;

      chainedTunnel.connect(fakeConnectData);

      if (mockTunnelA.onstatechange) {
        mockTunnelA.onstatechange(TunnelState.CLOSED);
      }

      if (mockTunnelB.onstatechange) {
        mockTunnelB.onstatechange(TunnelState.OPEN);
      }

      expect(mockTunnelA.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelA.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(mockTunnelB.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelB.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(chainedTunnel.onerror).not.toHaveBeenCalled();

      expect(chainedTunnel.onstatechange).toBe(expectedOnStateChangeCallback);
      expect(mockTunnelA.onstatechange).not.toBe(expectedOnStateChangeCallback);
      expect(mockTunnelB.onstatechange).toBe(expectedOnStateChangeCallback);
    });

    it('onerror first UPSTREAM_TIMEOUT', () => {
      const fakeConnectData = faker.datatype.string(10);
      const expectedOnErrorCallback = jest.fn();
      const expectedOnStateChangeCallback = jest.fn();

      const chainedTunnel = new ChainedTunnel(mockTunnelA, mockTunnelB);
      chainedTunnel.onerror = expectedOnErrorCallback;
      chainedTunnel.onstatechange = expectedOnStateChangeCallback;

      chainedTunnel.connect(fakeConnectData);

      expect(mockTunnelA.onerror).not.toBeNull();
      if (mockTunnelA.onerror) {
        mockTunnelA.onerror(new UpstreamTimeoutError());
      }

      expect(mockTunnelA.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelA.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(mockTunnelB.connect).not.toHaveBeenCalled();

      expect(chainedTunnel.onerror).toHaveBeenCalledTimes(1);

      expect(chainedTunnel.onstatechange).toBe(expectedOnStateChangeCallback);
      expect(mockTunnelA.onstatechange).not.toBe(expectedOnStateChangeCallback);
      expect(mockTunnelB.onstatechange).not.toBe(expectedOnStateChangeCallback);
    });

    it('onstatechange first OPEN', () => {
      const fakeConnectData = faker.datatype.string(10);
      const expectedOnErrorCallback = jest.fn();
      const expectedOnStateChangeCallback = jest.fn();
      const expectedOnInstructionCallback = jest.fn();

      const chainedTunnel = new ChainedTunnel(mockTunnelA, mockTunnelB);
      chainedTunnel.onerror = expectedOnErrorCallback;
      chainedTunnel.onstatechange = expectedOnStateChangeCallback;
      chainedTunnel.oninstruction = expectedOnInstructionCallback;

      chainedTunnel.connect(fakeConnectData);

      expect(mockTunnelA.oninstruction).not.toBeNull();
      if (mockTunnelA.oninstruction) {
        mockTunnelA.oninstruction('opcode', []);
      }

      expect(mockTunnelA.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelA.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(mockTunnelB.connect).not.toHaveBeenCalled();

      expect(chainedTunnel.onerror).not.toHaveBeenCalled();

      expect(chainedTunnel.onstatechange).toBe(expectedOnStateChangeCallback);
      expect(mockTunnelA.onstatechange).toBe(expectedOnStateChangeCallback);
      expect(mockTunnelB.onstatechange).not.toBe(expectedOnStateChangeCallback);
      expect(chainedTunnel.oninstruction).toBe(expectedOnInstructionCallback);
      expect(mockTunnelA.oninstruction).toBe(expectedOnInstructionCallback);
      expect(mockTunnelB.oninstruction).not.toBe(expectedOnInstructionCallback);
    });

    it('onstatechange first OPEN, multiple connect', () => {
      const fakeConnectData = faker.datatype.string(10);
      const expectedOnErrorCallback = jest.fn();
      const expectedOnStateChangeCallback = jest.fn();

      const chainedTunnel = new ChainedTunnel(mockTunnelA, mockTunnelB);
      chainedTunnel.onerror = expectedOnErrorCallback;
      chainedTunnel.onstatechange = expectedOnStateChangeCallback;

      chainedTunnel.connect(fakeConnectData);

      expect(mockTunnelA.onstatechange).not.toBeNull();
      if (mockTunnelA.onstatechange) {
        mockTunnelA.onstatechange(TunnelState.OPEN);
      }

      expect(mockTunnelA.connect).toHaveBeenCalledTimes(1);
      expect(mockTunnelA.connect).toHaveBeenLastCalledWith(fakeConnectData);

      expect(mockTunnelB.connect).not.toHaveBeenCalled();

      const secondFakeConnectData = faker.datatype.string(12);
      chainedTunnel.connect(secondFakeConnectData);

      expect(mockTunnelA.onstatechange).not.toBeNull();
      if (mockTunnelA.onstatechange) {
        mockTunnelA.onstatechange(TunnelState.OPEN);
      }

      expect(mockTunnelA.connect).toHaveBeenCalledTimes(2);
      expect(mockTunnelA.connect).toHaveBeenLastCalledWith(
        secondFakeConnectData,
      );

      expect(mockTunnelB.connect).not.toHaveBeenCalled();

      expect(chainedTunnel.onerror).not.toHaveBeenCalled();

      expect(chainedTunnel.onstatechange).toBe(expectedOnStateChangeCallback);
      expect(mockTunnelA.onstatechange).toBe(expectedOnStateChangeCallback);
      expect(mockTunnelB.onstatechange).not.toBe(expectedOnStateChangeCallback);
    });
  });
});
