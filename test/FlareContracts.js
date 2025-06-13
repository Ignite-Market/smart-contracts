const { expect } = require("chai");
const { ethers } = require("hardhat");

const CONTRACT_REGISTRY_ADDRESS = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
const CONTRACT_REGISTRY_ABI = [
  {
    'inputs': [
      {
        'internalType': 'address',
        'name': '_addressUpdater',
        'type': 'address'
      }
    ],
    'stateMutability': 'nonpayable',
    'type': 'constructor'
  },
  {
    'inputs': [],
    'name': 'getAddressUpdater',
    'outputs': [
      {
        'internalType': 'address',
        'name': '_addressUpdater',
        'type': 'address'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [],
    'name': 'getAllContracts',
    'outputs': [
      {
        'internalType': 'string[]',
        'name': '',
        'type': 'string[]'
      },
      {
        'internalType': 'address[]',
        'name': '',
        'type': 'address[]'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [
      {
        'internalType': 'bytes32',
        'name': '_nameHash',
        'type': 'bytes32'
      }
    ],
    'name': 'getContractAddressByHash',
    'outputs': [
      {
        'internalType': 'address',
        'name': '',
        'type': 'address'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [
      {
        'internalType': 'string',
        'name': '_name',
        'type': 'string'
      }
    ],
    'name': 'getContractAddressByName',
    'outputs': [
      {
        'internalType': 'address',
        'name': '',
        'type': 'address'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [
      {
        'internalType': 'bytes32[]',
        'name': '_nameHashes',
        'type': 'bytes32[]'
      }
    ],
    'name': 'getContractAddressesByHash',
    'outputs': [
      {
        'internalType': 'address[]',
        'name': '',
        'type': 'address[]'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [
      {
        'internalType': 'string[]',
        'name': '_names',
        'type': 'string[]'
      }
    ],
    'name': 'getContractAddressesByName',
    'outputs': [
      {
        'internalType': 'address[]',
        'name': '',
        'type': 'address[]'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [
      {
        'internalType': 'bytes32[]',
        'name': '_contractNameHashes',
        'type': 'bytes32[]'
      },
      {
        'internalType': 'address[]',
        'name': '_contractAddresses',
        'type': 'address[]'
      }
    ],
    'name': 'updateContractAddresses',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
];

describe("Flare Contracts on forked testnet", function () {
  let provider;
  let registry;

  before(async function () {
    await hre.network.provider.send("hardhat_reset", [{ forking: { jsonRpcUrl: hre.config.networks.hardhat.forking.url } }]);
        
    provider = ethers.provider;
    registry = new ethers.Contract(CONTRACT_REGISTRY_ADDRESS, CONTRACT_REGISTRY_ABI, provider);
  });

  it("ContractRegistry should be deployed and have code", async function () {
    const code = await provider.getCode(CONTRACT_REGISTRY_ADDRESS);
    expect(code).to.not.equal("0x");
  });

  it("Should resolve FdcVerification address and verify code exists", async function () {
    const fdcVerificationAddr = await registry.getContractAddressByName("FdcVerification");
    expect(fdcVerificationAddr).to.properAddress;

    const fdcCode = await provider.getCode(fdcVerificationAddr);
    expect(fdcCode).to.not.equal("0x");
  });

  it("Should print all registered contract names and addresses", async function () {
    const [names, _addresses] = await registry.getAllContracts();
    expect(names).to.include("FdcVerification");
  });
}); 