// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract EnerDAO is Ownable {
    using SafeERC20 for IERC20;

    address public signer;

    mapping(address => bool) public whitelist;
    mapping(address => uint256) public userShares;
    address[] public usersWithShares;
    mapping(address => bool) public userExists;


    IERC20 public immutable token; 
    uint256 public totalShares; 
    uint256 public immutable maxShares; 
    uint256 public immutable pricePerShare; 
    address public vault; // contract containing income shares
    address public immutable treasury;

    uint256 public ownerFee; 
    uint256 public constant ownerFeeMAX = 1000; // 10% 
    uint256 public treasuryFee; 
    uint256 public constant treasuryFeeMAX = 1000; // 10% 

    uint256 public epoch;
    mapping(uint256 => uint256) public epochAmount;
    mapping(address => uint256) public claimable; // user => amount

    mapping(address => bool) public isBuyer;
    address[] public buyers;

    uint8 votingStatus; // 0 = inactive, 1 = ongoing
    uint256 votingProposalId;
    uint256 votingEnd;
    mapping(uint256 => bool) public proposalIdTaken;
    mapping(uint256 => uint256) public proposals; // votingProposalId => treasuryFee
    mapping(uint256 => mapping(bool => uint256)) public voteStandings; // false = disagree | true = agree
    mapping(uint256 => mapping(address => uint256)) public userVotes; // votingProposalId => user => weights
    mapping(uint256 => address[]) public proposalVoters;
    mapping(uint256 => mapping(address => bool)) public proposalAddressHasVoted;

    event Buy(address user, uint256 shares);
    event Allocate(uint256 amount);
    event VoteStart(uint256 votingProposalId, uint256 proposal);
    event Vote(uint256 votingProposalId, address user, bool choice, uint256 weight);

    uint256 orderId;
    struct SellOrder {
        address seller;
        uint256 shares;
        bool active;
    }
    mapping(uint256 => SellOrder) public orders;
    mapping(address => uint256) public ordersAttachedShares; // user => shares

    event OpenOrder(address user, uint256 shares);
    event CompleteOrder(uint256 orderId, address user, uint256 shares);
    event CancelOrder(uint256 orderId, address user, uint256 shares);
    event TransferShares(address indexed sender, address indexed recipient, uint256 shares);

    modifier isWhitelisted(address _user) {
        require(whitelist[_user], "User not whitelisted.");
        _;
    }

    constructor(
        address _signer,
        address _token,
        uint256 _maxShares,
        uint256 _pricePerShare,
        address _treasury,
        uint256 _ownerFee,
        uint256 _treasuryFee
    ) {
        signer = _signer;
        token = IERC20(_token);
        maxShares = _maxShares;
        pricePerShare = _pricePerShare;
        treasury = _treasury;
        
        require(_ownerFee <= ownerFeeMAX, 'Fee too high.');
        ownerFee = _ownerFee;

        require(_treasuryFee <= treasuryFeeMAX, 'Fee too high.');
        treasuryFee = _treasuryFee;
    }

    function whitelistUsers(address[] calldata users) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            whitelist[users[i]] = true;
        }
    }

    function getUserShares() public view returns (uint256[] memory) {
        uint256[] memory shares = new uint256[](usersWithShares.length);
        for (uint256 i = 0;  i < usersWithShares.length; i++) {
            shares[i] = userShares[usersWithShares[i]];
        }
        return shares;
    }

    function allUsersWithShares() public view returns (address[] memory) {
        return usersWithShares;
    }

    function getUsersWithShares() public view returns (address[] memory) {
        return usersWithShares;
    }

    function buy(
        address _user, 
        uint256 _shares,
        uint256 _timestamp, 
        bytes memory _signature
    ) external {
        require(
            validateSignature(msg.sender, _user, _shares, _timestamp, _signature), 
            "Invalid signature."
        );
        require(_timestamp > block.timestamp, "Signature expired.");

        totalShares += _shares;
        require(
            totalShares <= maxShares,
            "Not enough shares."
        );

        // Allocate shares
        userShares[_user] += _shares;
        if (!userExists[_user]) {
            userExists[_user] = true;
            usersWithShares.push(_user);
        }

        whitelist[msg.sender] = true;
        whitelist[_user] = true;

        if (!isBuyer[_user]) {
            // collect buyer, if buying for the first time (for income distribution)
            isBuyer[_user] = true;
            buyers.push(_user);
        }

        require(token.transferFrom(msg.sender, owner(), _shares * pricePerShare));

        emit Buy(msg.sender, _shares);
    }

    function allocate() public {
        uint256 bal = token.balanceOf(address(this));
        require(bal > 0, "Balance zero.");

        emit Allocate(bal);

        uint256 ownerAmount;
        uint256 treasuryAmount;

        // Owner FEE
        if (ownerFee > 0) {
            ownerAmount = bal * ownerFee / 10_000;
            require(token.transfer(owner(), ownerAmount));
        }

        // Treasury FEE
        if (treasuryFee > 0) {
            treasuryAmount = bal * treasuryFee / 10_000;
            require(token.transfer(treasury, treasuryAmount));
        }

        bal = bal - ownerAmount - treasuryAmount;

        require(token.transfer(vault, bal));

        epoch += 1;
        epochAmount[epoch] = bal;

        // allocate to users -- normalize with 1e12 to avoid decimal places
        // NOTE: in case of lots of buyers, we could hit gas limit here
        uint256 percentShare;
        for (uint i = 0; i < getBuyersLength(); i++) {
            percentShare = userShares[buyers[i]] * 100 * 1e12 / totalShares;
            claimable[buyers[i]] += percentShare * bal / 100 / 1e12;
        }
    }

    function distribute(uint256 _from, uint256 _to) public {
        address buyer;
        uint256 amt;
        for (uint i = _from; i < _to; i++) {
            buyer = buyers[i];
            amt = claimable[buyer];
            claimable[buyer] = 0;
            token.transferFrom(vault, buyer, amt);
        }
    }

    function distributeAll() public {
        distribute(0, getBuyersLength());
    }

    function depositAllocate(uint256 _amount) public {
        token.transferFrom(msg.sender, address(this), _amount);
        allocate();
    }

    function depositAllocateDistribute(uint256 _amount) external {
        depositAllocate(_amount);
        distributeAll();
    }

    function getBuyersLength() public view returns (uint256) {
        return buyers.length;
    }

 
    function startVoting(
        uint256 timestampEnd, 
        uint256 proposal, 
        uint256 _votingProposalId
    ) external onlyOwner {
        require(votingStatus == 0, "Voting not pending");
        uint256 duration = timestampEnd - block.timestamp;
        require(
            duration >= 1 days && duration <= 4 weeks, 
            "Invalid duration"
        );
        require(
            proposal <= treasuryFeeMAX, 
            "Invalid proposal"
        );
        require(
            proposalIdTaken[_votingProposalId] == false,
            "_votingProposalId already used"
        );

        votingEnd = timestampEnd;
        votingStatus = 1;
        votingProposalId = _votingProposalId;

        proposalIdTaken[votingProposalId] = true;
        proposals[votingProposalId] = proposal;

        emit VoteStart(votingProposalId, proposal);
    }

    function vote(bool _choice) external {
        require(
            votingStatus == 1 && votingEnd > block.timestamp, 
            "Voting not active."
        );

        uint256 availableVotes = userShares[msg.sender] - userVotes[votingProposalId][msg.sender] - ordersAttachedShares[msg.sender];
        require (
            availableVotes > 0,
            "No available votes to apply."
        );

        userVotes[votingProposalId][msg.sender] += availableVotes;
        voteStandings[votingProposalId][_choice] += availableVotes;

        if (!proposalAddressHasVoted[votingProposalId][msg.sender]) {
            proposalAddressHasVoted[votingProposalId][msg.sender] = true;
            proposalVoters[votingProposalId].push(msg.sender);
        }

        emit Vote(votingProposalId, msg.sender, _choice, availableVotes);
    }

    function getProposalVoters(uint256 _votingProposalId) public view returns (address[] memory) {
        return proposalVoters[_votingProposalId];
    }

    function finalizeVoting() external {
        require(votingStatus == 1, "Voting inactive.");
        require(votingEnd <= block.timestamp, "Voting still active.");

        votingStatus = 0;
        if (voteStandings[votingProposalId][true] > voteStandings[votingProposalId][false]) {
            treasuryFee = proposals[votingProposalId];
        }
    }

    function transferShares(address recipient, uint256 shares) external isWhitelisted(msg.sender) isWhitelisted(recipient) {
        require(userShares[msg.sender] >= shares, "Not enough available shares.");
    
        userShares[msg.sender] -= shares;
        userShares[recipient] += shares;

        emit TransferShares(msg.sender, recipient, shares);
    }

    function openOrder(uint256 shares) external {
        if (votingStatus == 0) {
            require(userShares[msg.sender] >= shares, "Not enough available shares."); 
        } else {   
            require(
                userShares[msg.sender] - userVotes[votingProposalId][msg.sender] >= shares, 
                "Not enough available shares. (2)"
            );
        }     

        orderId += 1;
        orders[orderId] = SellOrder({
            seller: msg.sender,
            shares: shares,
            active: true
        });
        ordersAttachedShares[msg.sender] += shares;

        emit OpenOrder(msg.sender, shares);
    }

    function completeOrder(uint256 _orderId) external isWhitelisted(msg.sender) {
        SellOrder storage order = orders[_orderId];
        require(order.active, 'Order not active.');
        require(order.seller != msg.sender, 'Seller == buyer');

        order.active = false;
        userShares[order.seller] -= order.shares;
        ordersAttachedShares[order.seller] -= order.shares;
        userShares[msg.sender] += order.shares;

        require(token.transferFrom(msg.sender, order.seller, order.shares * pricePerShare));

        emit CompleteOrder(_orderId, msg.sender, order.shares);
    }

    function cancelOrder(uint256 _orderId) external {
        SellOrder storage order = orders[_orderId];
        require(order.active, 'Order not active.');
        require(order.seller == msg.sender, 'Seller != msg.sender');

        order.active = false;
        ordersAttachedShares[msg.sender] -= order.shares;

        emit CancelOrder(_orderId, msg.sender, order.shares);
    }

    function setOwnerFee(uint256 _fee) external onlyOwner {
        require(_fee <= ownerFeeMAX, 'Fee too high.');
        ownerFee = _fee;
    }

    function setVault(address _vault) external onlyOwner {
        require(vault == address(0), 'Vault address already set.');
        vault = _vault;
    }

    /**
    * @dev Validates signature for character mint.
    * @param _sender msg.sender
    * @param _receiver receiver of shares
    * @param _shares shares to be bought
    * @param _timestamp Signature expiration timestamp.
    * @param _signature Signature of above data.
    */
    function validateSignature(
        address _sender, 
        address _receiver, 
        uint256 _shares,
        uint256 _timestamp,
        bytes memory _signature
    ) public view returns (bool) {
        bytes32 dataHash = keccak256(
            abi.encodePacked(_sender, _receiver, _shares, _timestamp, address(this), block.chainid)
        );
        bytes32 message = ECDSA.toEthSignedMessageHash(dataHash);
        address receivedAddress = ECDSA.recover(message, _signature);
        return (receivedAddress == signer);
    }

    /**
     * Set signer address.
     */
    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
    }
}
