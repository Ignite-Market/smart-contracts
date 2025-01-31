const { utils, BigNumber } = require("ethers");

/**
 * @dev Creates a list of proofs for a given set of results.
 * @param results List of results.
 * @returns List of proofs.
 */
function createProofList(results) {
  const proofs = [];

  for (res of results) {
    proofs.push({
      merkleProof: [],
      data: {
        attestationType: ethers.utils.formatBytes32String("JsonApi"),
        sourceId: ethers.utils.formatBytes32String("Source_01"),
        votingRound: 0,
        lowestUsedTimestamp: 0,
        requestBody: {
          url: res.url,
          postprocessJq: "",
          abi_signature: ""
        },
        responseBody: { 
          abi_encoded_data: ethers.utils.defaultAbiCoder.encode(
            [ "uint256" ], 
            [ res.result ]
          )
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
  createProofList
}