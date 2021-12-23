import AbstractTunnel, {Tunnel} from './tunnel';
import {Status, StatusCode} from './Status';
import {State} from './state';

/**
 * Guacamole Tunnel which cycles between all specified tunnels until
 * no tunnels are left. Another tunnel is used if an error occurs but
 * no instructions have been received. If an instruction has been
 * received, or no tunnels remain, the error is passed directly out
 * through the onerror handler (if defined).
 */
export default class ChainedTunnel extends AbstractTunnel implements Tunnel {
  /**
   * Data passed in via connect(), to be used for
   * wrapped calls to other tunnels' connect() functions.
   * @private
   */
  private connectData?: string;

  /**
   * Array of all tunnels passed to this ChainedTunnel through the
   * constructor arguments.
   * @private
   */
  private tunnels: Tunnel[] = [];

  private candidateTunnel: Tunnel | null = null;

  /**
   * The tunnel committed, if any, or null if no tunnel
   * has yet been committed.
   *
   * @private
   */
  private committedTunnel: Tunnel | null = null;

  /*
   * @constructor
   * @augments Tunnel
   * @param tunnelChain - The tunnels to use, in order of priority.
   */
  constructor(...tunnelChain: Tunnel[]) {
    super();

    // Load all tunnels into array
    this.tunnels.push(...tunnelChain);
  }

  public isConnected(): boolean {
    if (this.committedTunnel !== null) {
      return this.committedTunnel.isConnected();
    }

    if (this.candidateTunnel !== null) {
      return this.candidateTunnel.isConnected();
    }

    return false;
  }

  public connect(data?: string) {
    // Remember connect data
    this.connectData = data;

    if (this.committedTunnel !== null) {
      this.committedTunnel.connect(this.connectData);
      return;
    }

    // Get first tunnel on the list
    const candidate = this.tunnels.shift();

    if (candidate !== undefined) {
      // Attach first tunnel
      this.candidateTunnel = candidate;
      this.attachToCandidateTunnel(candidate);
      this.candidateTunnel.connect(this.connectData);

      return;
    }

    // If there IS no first tunnel, error
    if (this.onerror !== null) {
      this.onerror(new Status(StatusCode.SERVER_ERROR));
    }
  }

  public disconnect() {
    if (this.committedTunnel !== null) {
      this.committedTunnel.disconnect();
      return;
    }

    if (this.candidateTunnel !== null) {
      this.candidateTunnel.disconnect();
    }
  }

  public sendMessage(...elements: any[]) {
    if (this.committedTunnel !== null) {
      this.committedTunnel.sendMessage(...elements);
      return;
    }

    if (this.candidateTunnel !== null) {
      this.candidateTunnel.sendMessage();
    }
  }

  /**
   * Sets the candidate tunnel.
   *
   * @private
   * @param candidate - The tunnel to set as the candidate tunnel.
   */
  private attachToCandidateTunnel(candidate: Tunnel) {
    // Wrap own onstatechange within current tunnel
    candidate.onstatechange = (state: State) => {
      if (state === State.OPEN) {
        // If open, use this tunnel from this point forward.
        this.setCommittedTunnel(candidate);

        if (this.onstatechange !== null) {
          this.onstatechange(state);
        }
      } else if (state === State.CLOSED) {
        candidate.onstatechange = null;
        candidate.oninstruction = null;
        candidate.onerror = null;

        // If closed, mark failure, attempt next tunnel
        const nextCandidate = this.tunnels.shift();

        if (nextCandidate !== undefined) {
          this.candidateTunnel = nextCandidate;
          this.attachToCandidateTunnel(nextCandidate);
          this.candidateTunnel.connect(this.connectData);
          return;
        }

        if (this.onstatechange !== null) {
          this.onstatechange(state);
        }
      }
    };

    // Wrap own oninstruction within current tunnel
    candidate.oninstruction = (opcode, elements) => {
      // Accept current tunnel
      this.candidateTunnel = null;
      this.setCommittedTunnel(candidate);

      // Invoke handler
      if (this.oninstruction !== null) {
        this.oninstruction(opcode, elements);
      }
    };

    // Attach next tunnel on error
    candidate.onerror = (status: Status) => {
      candidate.onstatechange = null;
      candidate.oninstruction = null;
      candidate.onerror = null;

      // Do not attempt to continue using next tunnel on server timeout
      if (status.code === StatusCode.UPSTREAM_TIMEOUT) {
        this.tunnels = [];
        this.candidateTunnel = null;

        if (this.onerror !== null) {
          this.onerror(status);
        }

        return;
      }

      // Get next tunnel
      const nextCandidate = this.tunnels.shift();

      // If there IS a next tunnel, try using it
      if (nextCandidate !== undefined) {
        this.candidateTunnel = nextCandidate;
        this.attachToCandidateTunnel(nextCandidate);
        this.candidateTunnel.connect(this.connectData);
        return;
      }

      if (this.onerror !== null) {
        this.onerror(status);
      }
    };
  }

  /**
   * Use the current tunnel from this point forward. Do not try any more
   * tunnels, even if the current tunnel fails.
   *
   * @private
   */
  private setCommittedTunnel(tunnel: Tunnel) {
    this.committedTunnel = tunnel;

    this.committedTunnel.onstatechange = this.onstatechange;
    this.committedTunnel.oninstruction = this.oninstruction;
    this.committedTunnel.onerror = this.onerror;
    this.committedTunnel.onuuid = this.onuuid;

    // Assign UUID if already known
    if (this.committedTunnel.uuid !== null) {
      this.setUUID(this.committedTunnel.uuid);
    }
  }
}
