import faker from 'faker';
import { Parser } from "@guacamole-client/protocol";
import data from "./__tests__/parser.json";

const fakerBase64 = (length: number, padding = false): string => {
  let wholeString = "";
  const charsArray = [
    ...Array(10).fill(1).map(function (x,i) { return String.fromCharCode(48 + i) }),
    ...Array(26).fill(1).map(function (x,i) { return String.fromCharCode(65 + i) }),
    ...Array(26).fill(1).map(function (x,i) { return String.fromCharCode(97 + i) }),
  ];
  for(let i = 0; i < length; i++) {
    wholeString += faker.random.arrayElement(charsArray);
  }
  if (padding) {
    wholeString += '=';
  }
  return wholeString;
};

describe("Protocol parser", () => {
  it.each(data)("oninstruction", ({ packet, instruction: { opcode, parameters } }) => {
    // Given
    const parser = new Parser();
    parser.oninstruction = jest.fn();

    // When
    parser.receive(packet);

    // Then
    expect(parser.oninstruction).toHaveBeenNthCalledWith(1, opcode, parameters);
  });

  it("on multiple instructions packet", () => {
    // Given
    const parser = new Parser();
    parser.oninstruction = jest.fn();

    const firstBlob = fakerBase64(1543, true);
    const secondBlob = fakerBase64(267, true);
    const packet = `3.img,1.1,2.14,1.0,9.image/png,2.35,2.76;4.blob,1.1,1544.${firstBlob};3.end,1.1;3.img,1.1,2.14,1.0,9.image/png,3.339,4.1064;4.blob,1.1,268.${secondBlob};3.end,1.1;4.sync,8.53463888;`;

    // When
    parser.receive(packet);

    // Then
    expect(parser.oninstruction).toHaveBeenCalledTimes(7);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(1, "img", ["1", "14", "0", "image/png", "35", "76"]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(2, "blob", ["1", firstBlob]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(3, "end", ["1"]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(4, "img", ["1", "14", "0", "image/png", "339", "1064"]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(5, "blob", ["1", secondBlob]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(6, "end", ["1"]);
    expect(parser.oninstruction).toHaveBeenNthCalledWith(7, "sync", ["53463888"]);
  });
});
