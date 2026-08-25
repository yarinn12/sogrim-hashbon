import { buildCompactInviteUrl } from "./compactInvite.mjs";

const ECC_CODEWORDS_PER_BLOCK_LOW = [
  7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
  20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
  28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30
];
const ERROR_CORRECTION_BLOCKS_LOW = [
  1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
  4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
  8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
  16, 17, 18, 19, 19, 20, 21, 22, 24, 25
];
const BYTE_MODE = 0x4;
const ECC_FORMAT_BITS_LOW = 1;
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

export function compactQrInviteUrl(inviteUrl) {
  try {
    const url = new URL(inviteUrl);
    const hasCloudAccess =
      url.searchParams.has("event") &&
      url.searchParams.has("space") &&
      url.searchParams.has("key");
    if (hasCloudAccess) {
      return buildCompactInviteUrl(
        url,
        url.searchParams.get("event"),
        url.searchParams.get("space"),
        url.searchParams.get("key")
      );
    }
    return url.toString();
  } catch {
    return inviteUrl;
  }
}

export function createQrSvg(text, options = {}) {
  const cellSize = Math.max(1, Math.floor(options.cellSize ?? 4));
  const quietZone = Math.max(0, Math.floor(options.quietZone ?? 4));
  const ariaLabel = escapeSvgAttribute(
    options.ariaLabel || "QR להצטרפות לאירוע"
  );
  const { size, modules } = createQrMatrix(text);
  const svgSize = (size + quietZone * 2) * cellSize;
  const pathCommands = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!modules[y][x]) continue;
      pathCommands.push(
        `M${(x + quietZone) * cellSize} ${(y + quietZone) * cellSize}h${cellSize}v${cellSize}h-${cellSize}z`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ariaLabel}" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${pathCommands.join("")}"/></svg>`;
}

function escapeSvgAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  const version = chooseVersion(bytes.length);
  const dataCodewords = encodeData(bytes, version);
  const codewords = addErrorCorrectionAndInterleave(dataCodewords, version);
  const base = createBaseMatrix(version);

  drawCodewords(base, codewords);

  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneMatrix(base);
    applyDataMask(candidate, mask);
    drawFormatBits(candidate, mask);
    const penalty = getPenaltyScore(candidate.modules);
    if (penalty < bestPenalty) {
      bestMask = mask;
      bestPenalty = penalty;
      bestModules = candidate.modules;
    }
  }

  return {
    size: qrSize(version),
    version,
    mask: bestMask,
    modules: bestModules
  };
}

function chooseVersion(byteLength) {
  for (let version = 1; version <= 40; version += 1) {
    const charCountBits = version <= 9 ? 8 : 16;
    if (byteLength >= 1 << charCountBits) continue;
    const dataBits = 4 + charCountBits + byteLength * 8;
    if (dataBits <= dataCodewordCount(version) * 8) return version;
  }

  throw new Error("QR invite link is too long");
}

function encodeData(bytes, version) {
  const dataCapacityBits = dataCodewordCount(version) * 8;
  const bits = [];
  appendBits(bits, BYTE_MODE, 4);
  appendBits(bits, bytes.length, version <= 9 ? 8 : 16);

  for (const byte of bytes) appendBits(bits, byte, 8);

  const terminatorBits = Math.min(4, dataCapacityBits - bits.length);
  appendBits(bits, 0, terminatorBits);
  while (bits.length % 8 !== 0) bits.push(0);

  const result = [];
  for (let i = 0; i < bits.length; i += 8) {
    result.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }

  for (let pad = 0xec; result.length < dataCodewordCount(version); pad ^= 0xfd) {
    result.push(pad);
  }

  return result;
}

function appendBits(target, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    target.push((value >>> i) & 1);
  }
}

function addErrorCorrectionAndInterleave(data, version) {
  const blockCount = ERROR_CORRECTION_BLOCKS_LOW[version - 1];
  const blockEccLength = ECC_CODEWORDS_PER_BLOCK_LOW[version - 1];
  const rawCodewords = Math.floor(rawDataModuleCount(version) / 8);
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const rsDivisor = reedSolomonDivisor(blockEccLength);
  const blocks = [];
  let offset = 0;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const dataLength = shortBlockLength - blockEccLength + (blockIndex < shortBlockCount ? 0 : 1);
    const dataBlock = data.slice(offset, offset + dataLength);
    offset += dataLength;
    const eccBlock = reedSolomonRemainder(dataBlock, rsDivisor);
    if (blockIndex < shortBlockCount) dataBlock.push(0);
    blocks.push([...dataBlock, ...eccBlock]);
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      if (i === shortBlockLength - blockEccLength && blockIndex < shortBlockCount) continue;
      result.push(blocks[blockIndex][i]);
    }
  }

  return result;
}

function createBaseMatrix(version) {
  const size = qrSize(version);
  const matrix = {
    version,
    size,
    modules: Array.from({ length: size }, () => Array(size).fill(false)),
    functionModules: Array.from({ length: size }, () => Array(size).fill(false))
  };

  drawFinderPattern(matrix, 3, 3);
  drawFinderPattern(matrix, size - 4, 3);
  drawFinderPattern(matrix, 3, size - 4);
  drawAlignmentPatterns(matrix);
  drawTimingPatterns(matrix);
  drawFormatBits(matrix, 0);
  drawVersionBits(matrix);

  return matrix;
}

function drawFinderPattern(matrix, centerX, centerY) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(matrix, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPatterns(matrix) {
  const positions = alignmentPatternPositions(matrix.version);
  const last = matrix.size - 7;

  for (const y of positions) {
    for (const x of positions) {
      if ((x === 6 && y === 6) || (x === 6 && y === last) || (x === last && y === 6)) {
        continue;
      }
      drawAlignmentPattern(matrix, x, y);
    }
  }
}

function drawAlignmentPattern(matrix, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(
        matrix,
        centerX + dx,
        centerY + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1
      );
    }
  }
}

function drawTimingPatterns(matrix) {
  for (let i = 0; i < matrix.size; i += 1) {
    if (!matrix.functionModules[6][i]) setFunctionModule(matrix, i, 6, i % 2 === 0);
    if (!matrix.functionModules[i][6]) setFunctionModule(matrix, 6, i, i % 2 === 0);
  }
}

function drawFormatBits(matrix, mask) {
  const data = (ECC_FORMAT_BITS_LOW << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const size = matrix.size;

  for (let i = 0; i <= 5; i += 1) setFunctionModule(matrix, 8, i, getBit(bits, i));
  setFunctionModule(matrix, 8, 7, getBit(bits, 6));
  setFunctionModule(matrix, 8, 8, getBit(bits, 7));
  setFunctionModule(matrix, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunctionModule(matrix, 14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i += 1) setFunctionModule(matrix, size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i += 1) setFunctionModule(matrix, 8, size - 15 + i, getBit(bits, i));
  setFunctionModule(matrix, 8, size - 8, true);
}

function drawVersionBits(matrix) {
  if (matrix.version < 7) return;

  let remainder = matrix.version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * 0x1f25);
  }
  const bits = (matrix.version << 12) | remainder;

  for (let i = 0; i < 18; i += 1) {
    const bit = getBit(bits, i);
    const a = matrix.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(matrix, a, b, bit);
    setFunctionModule(matrix, b, a, bit);
  }
}

function drawCodewords(matrix, data) {
  let bitIndex = 0;

  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;

    for (let vert = 0; vert < matrix.size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? matrix.size - 1 - vert : vert;
        if (matrix.functionModules[y][x]) continue;

        const bit = bitIndex < data.length * 8
          ? getBit(data[Math.floor(bitIndex / 8)], 7 - (bitIndex % 8))
          : false;
        matrix.modules[y][x] = bit;
        bitIndex += 1;
      }
    }
  }
}

function applyDataMask(matrix, mask) {
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.functionModules[y][x]) continue;
      if (maskApplies(mask, x, y)) matrix.modules[y][x] = !matrix.modules[y][x];
    }
  }
}

function maskApplies(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new Error("Invalid QR mask");
  }
}

function setFunctionModule(matrix, x, y, dark) {
  matrix.modules[y][x] = dark;
  matrix.functionModules[y][x] = true;
}

function getPenaltyScore(modules) {
  return (
    getRunPenalty(modules) +
    getBlockPenalty(modules) +
    getFinderLikePenalty(modules) +
    getBalancePenalty(modules)
  );
}

function getRunPenalty(modules) {
  let penalty = 0;
  const size = modules.length;

  for (let y = 0; y < size; y += 1) {
    penalty += lineRunPenalty(modules[y]);
  }

  for (let x = 0; x < size; x += 1) {
    const column = modules.map((row) => row[x]);
    penalty += lineRunPenalty(column);
  }

  return penalty;
}

function lineRunPenalty(line) {
  let penalty = 0;
  let runColor = line[0];
  let runLength = 1;

  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === runColor) {
      runLength += 1;
    } else {
      if (runLength >= 5) penalty += PENALTY_N1 + runLength - 5;
      runColor = line[i];
      runLength = 1;
    }
  }

  if (runLength >= 5) penalty += PENALTY_N1 + runLength - 5;
  return penalty;
}

function getBlockPenalty(modules) {
  let penalty = 0;
  const size = modules.length;

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
        penalty += PENALTY_N2;
      }
    }
  }

  return penalty;
}

function getFinderLikePenalty(modules) {
  let penalty = 0;
  const size = modules.length;

  for (let y = 0; y < size; y += 1) {
    penalty += lineFinderPenalty(modules[y]);
  }

  for (let x = 0; x < size; x += 1) {
    penalty += lineFinderPenalty(modules.map((row) => row[x]));
  }

  return penalty;
}

function lineFinderPenalty(line) {
  let penalty = 0;
  for (let i = 0; i <= line.length - 11; i += 1) {
    const value = line.slice(i, i + 11).reduce((bits, bit) => (bits << 1) | (bit ? 1 : 0), 0);
    if (value === 0x05d || value === 0x5d0) penalty += PENALTY_N3;
  }
  return penalty;
}

function getBalancePenalty(modules) {
  const size = modules.length;
  const total = size * size;
  const dark = modules.flat().filter(Boolean).length;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return Math.max(0, k) * PENALTY_N4;
}

function alignmentPatternPositions(version) {
  if (version === 1) return [];

  const size = qrSize(version);
  const count = Math.floor(version / 7) + 2;
  const step = version === 32
    ? 26
    : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];

  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position);
  }

  return result;
}

function dataCodewordCount(version) {
  return Math.floor(rawDataModuleCount(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK_LOW[version - 1] * ERROR_CORRECTION_BLOCKS_LOW[version - 1];
}

function rawDataModuleCount(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;
    result -= (25 * alignmentCount - 10) * alignmentCount - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function reedSolomonDivisor(degree) {
  let root = 1;
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;

  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = Array(divisor.length).fill(0);

  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }

  return result;
}

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function qrSize(version) {
  return version * 4 + 17;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function cloneMatrix(matrix) {
  return {
    version: matrix.version,
    size: matrix.size,
    modules: matrix.modules.map((row) => [...row]),
    functionModules: matrix.functionModules.map((row) => [...row])
  };
}
