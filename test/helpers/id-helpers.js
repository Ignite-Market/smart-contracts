const { BigNumber, utils } = require("ethers");
const { modInverse, modularSqrt } = require("./utils");

const altBN128P = BigNumber.from(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583"
);
const altBN128B = BigNumber.from(3);
const oddToggle = BigNumber.from(1).shl(254);

function getConditionId(oracle, questionId, outcomeSlotCount) {
  return utils.solidityKeccak256([
    "address",
    "bytes32",
    "uint256",
  ], [oracle, questionId, outcomeSlotCount]);
}

function getCollectionId(conditionId, indexSet) {
  const initHash = utils.solidityKeccak256(["bytes32", "uint256"], [conditionId, indexSet]);
  const odd = "89abcdef".includes(initHash[2]);

  let x = BigNumber.from(initHash).mod(altBN128P);
  let y, yy;

  do {
    x = x.add(1).mod(altBN128P);
    yy = x.mul(x).mod(altBN128P).mul(x).mod(altBN128P).add(altBN128B).mod(altBN128P);
    y = modularSqrt(yy, altBN128P);
  } while (!y || !y.mul(y).mod(altBN128P).eq(yy));

  let ecHash = x;
  if (odd) ecHash = ecHash.xor(oddToggle);

  return `0x${ecHash.toHexString().slice(2).padStart(64, "0")}`;
}

function combineCollectionIds(collectionIds) {
  if (Array.isArray(collectionIds) && collectionIds.length === 0) {
    return `0x${"0".repeat(64)}`;
  }

  const points = collectionIds.map(id => {
    let x = BigNumber.from(id);
    if (x.eq(0)) {
      // Identity point (0 in projective coordinates means Z = 0)
      return [BigNumber.from(1), BigNumber.from(1), BigNumber.from(0)];
    }
    const odd = x.and(oddToggle).eq(oddToggle);
    if (odd) x = x.xor(oddToggle);
    x = x.mod(altBN128P);

    let y, yy;
    yy = x.mul(x).mod(altBN128P).mul(x).mod(altBN128P).add(altBN128B).mod(altBN128P);
    y = modularSqrt(yy, altBN128P);
    if (y === null || !y.mul(y).mod(altBN128P).eq(yy)) {
      throw new Error(`Invalid collection ID ${id}`);
    }
    if (odd !== y.mod(2).eq(1)) y = altBN128P.sub(y);
    return [x, y];
  });

  const [X, Y, Z] = points.reduce(([X1, Y1, Z1], [x2, y2]) => {
    if (!Z1) {
      Z1 = BigNumber.from(1);
    }

    if (Z1.eq(0)) {
      return [x2, y2, BigNumber.from(1)];
    }

    const Z1Z1 = Z1.mul(Z1).mod(altBN128P);
    const U2 = x2.mul(Z1Z1).mod(altBN128P);
    const S2 = y2.mul(Z1).mul(Z1Z1).mod(altBN128P);
    const H = U2.sub(X1).mod(altBN128P);
    const HH = H.mul(H).mod(altBN128P);
    const I = HH.mul(4).mod(altBN128P);
    const J = H.mul(I).mod(altBN128P);
    const r = S2.sub(Y1).mul(2).mod(altBN128P);
    const V = X1.mul(I).mod(altBN128P);
    const X3 = r
      .mul(r)
      .sub(J)
      .sub(V.mul(2))
      .mod(altBN128P);
    const Y3 = r
      .mul(V.sub(X3))
      .sub(Y1.mul(J).mul(2))
      .mod(altBN128P);
    const Z3 = Z1.add(H)
      .mul(Z1.add(H))
      .sub(Z1Z1)
      .sub(HH)
      .mod(altBN128P);

    return [X3, Y3, Z3];
  });

  if (Z.eq(0)) {
    return `0x${"0".repeat(64)}`;
  }

  const invZ = modInverse(Z, altBN128P);
  const invZZ = invZ.mul(invZ).mod(altBN128P);
  const invZZZ = invZZ.mul(invZ).mod(altBN128P);
  const x = X.mul(invZZ).mod(altBN128P);
  const y = Y.mul(invZZZ).mod(altBN128P);

  let ecHash = x;
  if (y.mod(2).eq(1)) {
    ecHash = ecHash.xor(oddToggle);
  }

  return `0x${ecHash.toHexString().slice(2).padStart(64, "0")}`;
}

function getPositionId(collateralToken, collectionId) {
  return utils.solidityKeccak256([
    "address",
    "uint256",
  ], [collateralToken, collectionId]);
}

module.exports = {
  getConditionId,
  getCollectionId,
  combineCollectionIds,
  getPositionId,
};

