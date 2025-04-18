
import { ConditionalTokens } from "./../ConditionalTokens/ConditionalTokens.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FixedProductMarketMakerData {
    mapping (address => uint256) internal _balances;
    mapping (address => mapping (address => uint256)) internal _allowances;
    uint256 internal _totalSupply;


    bytes4 internal constant _INTERFACE_ID_ERC165 = 0x01ffc9a7;
    mapping(bytes4 => bool) internal _supportedInterfaces;


    event FPMMFundingAdded(
        address indexed funder,
        uint[] amountsAdded,
        uint sharesMinted
    );
    event FPMMFundingRemoved(
        address indexed funder,
        uint[] amountsRemoved,
        uint collateralRemovedFromFeePool,
        uint sharesBurnt
    );
    event FPMMBuy(
        address indexed buyer,
        uint investmentAmount,
        uint feeAmount,
        uint indexed outcomeIndex,
        uint outcomeTokensBought
    );
    event FPMMSell(
        address indexed seller,
        uint returnAmount,
        uint feeAmount,
        uint indexed outcomeIndex,
        uint outcomeTokensSold
    );
    ConditionalTokens internal conditionalTokens;
    IERC20 internal collateralToken;
    bytes32[] internal conditionIds;
    uint internal fee;
    uint internal feePoolWeight;

    address internal treasury;
    uint internal treasuryPercent;
    uint internal fundingThreshold;
    uint internal endTime;

    uint[] internal outcomeSlotCounts;
    bytes32[][] internal collectionIds;
    uint[] internal positionIds;

    mapping (address => uint256) internal withdrawnFees;
    uint internal totalWithdrawnFees;
}