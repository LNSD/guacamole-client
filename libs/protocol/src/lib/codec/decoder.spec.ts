import Decoder from './decoder';
import faker from 'faker';
import data from './__tests__/decoder.json';

const fakerBase64 = (length: number, padding = false): string => {
  let wholeString = '';
  const charsArray = [
    ...Array(10).fill(1).map(function(x, i) {
      return String.fromCharCode(48 + i);
    }),
    ...Array(26).fill(1).map(function(x, i) {
      return String.fromCharCode(65 + i);
    }),
    ...Array(26).fill(1).map(function(x, i) {
      return String.fromCharCode(97 + i);
    })
  ];
  for (let i = 0; i < length; i++) {
    wholeString += faker.random.arrayElement(charsArray);
  }
  if (padding) {
    wholeString = wholeString.slice(0, -1) + '=';
  }
  return wholeString;
};

describe('decoder', () => {
  it.each(data)('oninstruction', ({ packet, instruction: { opcode, parameters } }) => {
    // Given
    const parser = new Decoder();
    parser.oninstruction = jest.fn();

    // When
    parser.receive(packet);

    // Then
    expect(parser.oninstruction).toHaveBeenNthCalledWith(1, opcode, parameters);
  });

  it('on multiple instructions packet', () => {
    // Given
    const parser = new Decoder();
    parser.oninstruction = jest.fn();

    const firstBlob = fakerBase64(1544, true);
    const secondBlob = fakerBase64(268, true);
    const packet = `3.img,1.1,2.14,1.0,9.image/png,2.35,2.76;4.blob,1.1,1544.${firstBlob};3.end,1.1;3.img,1.1,2.14,1.0,9.image/png,3.339,4.1064;4.blob,1.1,268.${secondBlob};3.end,1.1;4.sync,8.53463888;0.;`;

    // When
    parser.receive(packet);

    // Then
    expect(parser.oninstruction).toHaveBeenCalledTimes(8);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(1, 'img', ['1', '14', '0', 'image/png', '35', '76']);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(2, 'blob', ['1', firstBlob]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(3, 'end', ['1']);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(4, 'img', ['1', '14', '0', 'image/png', '339', '1064']);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(5, 'blob', ['1', secondBlob]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(6, 'end', ['1']);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(7, 'sync', ['53463888']);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(8, '', []);
  });

  describe('partial packets', () => {
    const firstBlob = fakerBase64(1544, true);
    const secondBlob = fakerBase64(268, true);
    const packet = `3.img,1.1,2.14,1.0,9.image/png,2.35,2.76;4.blob,1.1,1544.${firstBlob};3.end,1.1;3.img,1.1,2.14,1.0,9.image/png,3.339,4.1064;4.blob,1.1,268.${secondBlob};3.end,1.1;4.sync,8.53463888;`;

    it('should buffer partial packets and store incomplete', () => {
      // Given
      const parser = new Decoder();
      parser.oninstruction = jest.fn();

      // When
      const partialPacket = packet.slice(0, 250);
      parser.receive(partialPacket);

      // Then
      expect(parser.oninstruction).toHaveBeenCalledTimes(1);
      expect(parser.oninstruction).toHaveBeenNthCalledWith(1, 'img', ['1', '14', '0', 'image/png', '35', '76']);

      expect(parser.bufferLength).toBe(209);
    });

    it('should buffer partial packets', () => {
      // Given
      const parser = new Decoder();
      parser.oninstruction = jest.fn();

      // When
      const partialPacket = packet.slice(0, 20);
      parser.receive(partialPacket);

      // Then
      expect(parser.oninstruction).toHaveBeenCalledTimes(0);

      expect(parser.bufferLength).toBe(20);
    });

    it('should buffer partial packets 3', () => {
      // Given
      const parser = new Decoder();
      parser.oninstruction = jest.fn();

      // When
      const partialPacket1 = packet.slice(0, 20);
      parser.receive(partialPacket1);
      const partialPacket2 = packet.slice(20, 250);
      parser.receive(partialPacket2);

      // Then
      expect(parser.oninstruction).toHaveBeenCalledTimes(1);
      expect(parser.oninstruction).toHaveBeenNthCalledWith(1, 'img', ['1', '14', '0', 'image/png', '35', '76']);

      expect(parser.bufferLength).toBe(209);
    });
  });

  describe('instruction listeners', () => {
    it('should call the right listener', () => {
      // Given
      const blob = fakerBase64(1544, true);
      const packet = `3.img,1.1,2.14,1.0,9.image/png,2.35,2.76;0.,1.8;4.blob,1.1,1544.${blob};0.,1.1;`;

      const allOpcodesListener = jest.fn();
      const emptyOpcodeListener = jest.fn();
      const imgOpcodeListener = jest.fn();

      const parser = new Decoder();
      parser.oninstruction = allOpcodesListener;
      parser.addInstructionListener('', emptyOpcodeListener);
      parser.addInstructionListener('img', imgOpcodeListener);

      // When
      parser.receive(packet);

      // Then
      expect(allOpcodesListener).toHaveBeenCalledTimes(4);

      expect(imgOpcodeListener).toHaveBeenCalledTimes(1);
      expect(imgOpcodeListener).toHaveBeenNthCalledWith(1, 'img', ['1', '14', '0', 'image/png', '35', '76']);

      expect(emptyOpcodeListener).toHaveBeenCalledTimes(2);
      expect(emptyOpcodeListener).toHaveBeenNthCalledWith(1, '', ['8']);
      expect(emptyOpcodeListener).toHaveBeenNthCalledWith(2, '', ['1']);
    });
  });
});
