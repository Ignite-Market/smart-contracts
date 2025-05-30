const { utils, BigNumber } = require("ethers");

/**
 * List of mock API URLs.
 * - First path parameter defines the name of the API (api*).
 * - Second path parameter defines the result of the API (0 or 1).
 */
const MockApiUrl = {
  API1_0: 'https://mock-api.ignitemarket.xyz/api1/0',
  API1_1: 'https://mock-api.ignitemarket.xyz/api1/1',
  API2_0: 'https://mock-api.ignitemarket.xyz/api2/0',
  API2_1: 'https://mock-api.ignitemarket.xyz/api2/1',
  API3_0: 'https://mock-api.ignitemarket.xyz/api3/0',
  API3_1: 'https://mock-api.ignitemarket.xyz/api3/1'
};

/**
 * @dev Returns proof data for a given URL.
 * 
 * @param url URL from MockApiUrl.
 * @returns Proof data object.
 */
function getProofData(url) {
  switch (url) {
    // API 1, result 0
    case MockApiUrl.API1_0:
      return {
        votingRound: 1001786,
        merkleProof: [
          '0x63e00a66285e390b8454b3eba8a3bff6bfa7bd221fba147878864040b0b26229',
          '0x12dd60aef467b3f84ee490ce3689aa9d03d4848eb8ccef139dcb2ca1ef7facc4',
          '0xf525ac4785f0886e97367bf3904b3b44a4c47e0d7e1ce01319c432917ab2b20b'
        ],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }

    // API 1, result 1
    case MockApiUrl.API1_1:
      return {
        votingRound: 1001777,
        merkleProof: [
          '0x6589881ff649c294ae21542765f9ad76ffa0a6751673c6650cc7daceeb330b76',
          '0x774790676bdb92763eae4850e6245fb2aeed331469af5649c93502a1ead81299',
          '0x7a24c8e52a159dec78f1b2b67fdbb5d6909d3c4df0f81ef81ca9dc21df59bde7',
          '0x30b09d4099c8ccdefdca27cf46814635fa842cba9d6c7f1b5e8e0113cdf1a624'
        ],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000001'
      }

    // API 2, result 0
    case MockApiUrl.API2_0:
      return {
        votingRound: 1001791,
        merkleProof: [
          '0x6402945785e01ed59573f232b25d828e13bd1e94b622aa26091be5bed8313088',
          '0x7e655934b1b5d883680ff360eaa1bdb45aac078fcb06f07f27dee3e2db567af3',
          '0xd311c9acada676a67e7b7c97a33a452891c9657ae2a3c0da258ed1bebafd5f5d',
          '0x8112a5c0984605c4f816a3d0d3202046290955e7bd5b2916848724da6d608640'
        ],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }

    // API 2, result 1
    case MockApiUrl.API2_1:
      return {
        votingRound: 1001793,
        merkleProof: [
          '0xf08fe9d0d05c9be99365ca64f3de1a60e1c9fbcd6b56dc93bcb69d60665d4908',
          '0x05748eb13e20d62cf53cf51c1ec041c8b7ce679b14aec0bbe83c8a089d9c0304',
          '0x55b55ddb4b6c5df460f4ad6870055b4ce4371860b0e0f1b6ecfda9d86b63e8b7',
          '0x37146958289226dba8f1143699448c12f6f5fb4472c0c12d0d34a17749be176c'
        ],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000001'
      }


    // API 3, result 0
    case MockApiUrl.API3_0:
      return {
        votingRound: 1001798,
        merkleProof: [
          '0x117f7d79abedf431b6395dc6a1626e393eb3ffe35d1e06ce2ba98091bdcecac9',
          '0x04830f185e7d258dd3a2c4801c9bd14916f8e8205d9f5bf54b17e061f1a25ef7',
          '0xaee911c586f1e62c07696ce0d815eed12375c9606e77fd6ac1a3c135e0d6cec3'
        ],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }

    // API 3, result 1
    case MockApiUrl.API3_1:
      return {
        votingRound: 1001801,
        merkleProof: [
          '0x58a68b9f093cabf42be6c9087ce01646cb7b219352ced3785b82a284630f7979',
          '0xe06576d4b146935349832dcd79054e48925fe96fffdd5f9d83622e192bfd09a4',
          '0x4c5d8c4489a396c8cdc4025eed7abf90ca2ab1d633b64c7ef5ce5be4a9c8840a',
          '0x6b8879dbd58dcd1ce380a6d09bc31980fff392725636ff33a1c2fb1114f8929a'
        ],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000001'
      }
  
    // Return invalid proof.
    default:
      return {
        votingRound: 0,
        merkleProof: [],
        abiEncodedData: '0x0000000000000000000000000000000000000000000000000000000000000000'
      };
  }
}

/**
 * @dev Creates a list of proofs for a given set of results.
 * 
 * @param results List of results.
 * @returns List of proofs.
 */
function createProofList(results) {
  const proofs = [];

  for (const res of results) {
    const proof = getProofData(res.url);

    proofs.push({
      merkleProof: proof.merkleProof,
      data: {
        attestationType: ethers.utils.formatBytes32String("Web2Json"),
        sourceId: ethers.utils.formatBytes32String("PublicWeb2"),
        votingRound: proof.votingRound,
        lowestUsedTimestamp: 0,
        requestBody: {
          url: res.url,
          httpMethod: "GET",
          headers: '{}',
          body: '{}',
          queryParams: '{}',
          postProcessJq: "{ \"outcomeIdx\": .result }",
          abiSignature: "{\"components\":[{\"internalType\":\"uint256\",\"name\":\"outcomeIdx\",\"type\":\"uint256\"}],\"type\":\"tuple\"}",
        },
        responseBody: { 
          abiEncodedData: proof.abiEncodedData
          // abiEncodedData: ethers.utils.defaultAbiCoder.encode(
          //   [ "uint256" ], 
          //   [ res.result ]
          // )
        }
      }
    });
  }

  return proofs;
}

/**
 * @dev Generates a random hex string of a given length.
 * @param byteLength Length of the hex string.
 * @returns Random hex string.
 */
function randomHex(byteLength) {
  return utils.hexlify(utils.randomBytes(byteLength));
}

/**
 * @dev Computes the modular square root of a given number.
 * @param a Number.
 * @param p Modulus.
 * @returns Modular square root.
 */
function modularSqrt(a, p) {
  if (a.isZero()) return BigNumber.from(0);
  
  // Check if p % 4 == 3 (fast path)
  if (p.mod(4).eq(3)) {
    const exponent = p.add(1).div(4);
    const res = modPow(a, exponent, p);
    return res;
  }

  // Tonelli-Shanks algorithm
  let q = p.sub(1);
  let s = 0;
  while (q.mod(2).eq(0)) {
    q = q.div(2);
    s += 1;
  }

  // Find a non-quadratic residue (z) for p
  let z = BigNumber.from(2);
  while (z.modPow(p.sub(1).div(2), p).eq(1)) {
    z = z.add(1);
  }

  let m = s;
  let c = z.modPow(q, p); 
  let t = a.modPow(q, p); 
  let r = a.modPow(q.add(1).div(2), p);

  while (!t.eq(1)) {
    let i = 0;
    let t2i = t;
    while (!t2i.eq(1) && i < m) {
      t2i = t2i.pow(2).mod(p);
      i += 1;
    }

    if (i === m) return null; // No square root exists

    let b = c.pow(2).mod(p);
    r = r.mul(b).mod(p);
    c = b.pow(2).mod(p);
    t = t.mul(c).mod(p);
    m = i;
  }

  return r;
}

/**
 * @dev Computes the modular power of a given base, exponent, and modulus.
 * @param base Base.
 * @param exponent Exponent.
 * @param modulus Modulus.
 * @returns Modular power.
 */
function modPow(base, exponent, modulus) {
  let result = BigNumber.from(1);  // Start with 1
  base = base.mod(modulus);  // Ensure the base is within the modulus

  while (exponent.gt(0)) {
    if (exponent.and(1).eq(1)) {  // If exponent is odd
      result = result.mul(base).mod(modulus);
    }
    base = base.mul(base).mod(modulus);  // Square the base
    exponent = exponent.shr(1);  // Divide exponent by 2
  }

  return result;
}

/**
 * @dev Computes the modular inverse of a given number.
 * @param a Number.
 * @param p Modulus.
 * @returns Modular inverse.
 */
function modInverse(a, p) {
  // Extended Euclidean Algorithm to find the modular inverse
  let [t, newT] = [BigNumber.from(0), BigNumber.from(1)];
  let [r, newR] = [p, a];

  while (!newR.eq(0)) {
    const quotient = r.div(newR);
    [t, newT] = [newT, t.sub(quotient.mul(newT))];
    [r, newR] = [newR, r.sub(quotient.mul(newR))];
  }

  if (r.gt(1)) {
    throw new Error("No modular inverse");
  }

  if (t.lt(0)) {
    t = t.add(p);
  }

  return t;
}

module.exports = {
  randomHex,
  modInverse,
  modPow,
  modularSqrt,
  createProofList,
  MockApiUrl
}