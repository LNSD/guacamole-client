export type OnInstructionCallback = (opcode: string, parameters: any[]) => void;

/**
 * Simple Guacamole protocol parser that invokes an oninstruction event when
 * full instructions are available from data received via receive().
 */
export default class Parser {
  /**
   * Fired once for every complete Guacamole instruction received, in order.
   *
   * @event
   * @param {String} opcode The Guacamole instruction opcode.
   * @param {Array} parameters The parameters provided for the instruction,
   *                           if any.
   */
  public oninstruction: OnInstructionCallback | null = null;

  /**
   * Current buffer of received data. This buffer grows until a full
   * element is available. After a full element is available, that element
   * is flushed into the element buffer.
   *
   * @private
   */
  private buffer = "";

  /**
   * Buffer of all received, complete elements. After an entire instruction
   * is read, this buffer is flushed, and a new instruction begins.
   *
   * @private
   */
  private elementBuffer: string[] = [];

  /**
   * Appends the given instruction data packet to the internal buffer of
   * this Parser, executing all completed instructions at
   * the beginning of this buffer, if any.
   *
   * @param packet - The instruction data to receive.
   */
  public receive(packet: string) {
    // The location of the last element's terminator
    let elementEnd = -1;

    // Where to start the next length search or the next element
    let startIndex = 0;

    // Truncate buffer as necessary
    if (startIndex > 4096 && elementEnd >= startIndex) {
      this.buffer = this.buffer.substring(startIndex);

      // Reset parse relative to truncation
      elementEnd -= startIndex;
      startIndex = 0;
    }

    // Append data to buffer
    this.buffer += packet;

    // While search is within currently received data
    while (elementEnd < this.buffer.length) {
      // If we are waiting for element data
      if (elementEnd >= startIndex) {
        // We now have enough data for the element. Parse.
        const element = this.buffer.substring(startIndex, elementEnd);
        const terminator = this.buffer.substring(elementEnd, elementEnd + 1);

        // Add element to array
        this.elementBuffer.push(element);

        // If last element, handle instruction
        if (terminator === ";") {
          // Get opcode
          const opcode = this.elementBuffer.shift();

          if (opcode === undefined) {
            throw new Error("Opcode not found");
          }

          // Call instruction handler.
          if (this.oninstruction !== null) {
            this.oninstruction(opcode, [...this.elementBuffer]);
          }

          // Clear elements
          this.elementBuffer.length = 0;
        } else if (terminator !== ",") {
          throw new Error("Illegal terminator.");
        }

        // Start searching for length at character after
        // element terminator
        startIndex = elementEnd + 1;
      }

      // Search for end of length
      const lengthEnd = this.buffer.indexOf(".", startIndex);
      if (lengthEnd === -1) {
        // If no period yet, continue search when more data is received
        startIndex = this.buffer.length;
        break;
      }

      // Parse length
      const length = parseInt(this.buffer.substring(elementEnd + 1, lengthEnd), 10);
      if (isNaN(length)) {
        throw new Error("Non-numeric character in element length.");
      }

      // Calculate start of element
      startIndex = lengthEnd + 1;

      // Calculate location of element terminator
      elementEnd = startIndex + length;
    }
  }
}
