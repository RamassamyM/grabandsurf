// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// KorkoBoardV2: each Grab&Surf cork board is an NFT with an on-chain life log.
//
// New in V2 (V1 = KorkoPlanche):
//   - INSPECTION events carrying a proof (SHA-256 of the return photo);
//   - CORRECTION: a wrong event is never erased, it is corrected by a new entry;
//   - SOLD: implicit purchase, the NFT is transferred to the customer's wallet;
//   - roles: OPERATOR (backend), REPAIRER (workshop), SPONSOR_MANAGER (owner);
//   - sponsorship by a partner with the design of a local artist, shown in tokenURI.
//
// What goes on-chain: board, station, event type, flow time, proofs, and the PUBLIC
// names of sponsors and artists who agreed to it. Never a customer, a phone or a card.

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract KorkoBoardV2 is ERC721, AccessControl {
    using Strings for uint256;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant REPAIRER_ROLE = keccak256("REPAIRER_ROLE");
    bytes32 public constant SPONSOR_MANAGER_ROLE = keccak256("SPONSOR_MANAGER_ROLE");

    // Event types: 0 to 6 keep the V1 numbering.
    uint8 public constant SERVICE = 0;
    uint8 public constant DEPART = 1;
    uint8 public constant RETURN = 2;
    uint8 public constant FOREIGN_RETURN = 3;   // returned to another station
    uint8 public constant REPAIR = 4;
    uint8 public constant REFURBISH = 5;
    uint8 public constant LOST = 6;
    uint8 public constant INSPECTION = 7;       // proof = SHA-256 of the inspection photo
    uint8 public constant CORRECTION = 8;       // proof = index of the corrected event
    uint8 public constant SOLD = 9;             // implicit purchase, NFT transferred
    uint8 public constant NB_TYPES = 10;

    struct BoardState {
        bytes1 home;          // home station: "A", "B", "C"
        bytes1 station;       // last known station (0 when at sea, lost or sold)
        uint8 lastType;
        uint64 lastT;         // t field of the station flow (seconds)
        uint32 departures;
        uint32 events;
        bytes32 lastProof;
    }

    struct Sponsorship {
        string sponsorName;   // public name, given with consent
        address sponsorWallet; // optional (zero address)
        string artistName;
        address artistWallet;  // optional (zero address)
        bytes32 designHash;   // SHA-256 of the design file
        string designURI;     // where the design image is published
        uint64 startDate;     // unix dates chosen by the parties
        uint64 endDate;       // 0 = open-ended
        bool active;
    }

    address public treasury;          // holds the boards until one is sold
    string public defaultImageURI;
    mapping(uint256 => BoardState) public states;
    mapping(uint256 => Sponsorship) private _sponsorships;
    mapping(uint256 => uint32) public sponsorshipCount;

    event BoardEvent(
        uint256 indexed board, uint8 indexed eventType, bytes1 station, uint64 t, uint32 index, bytes32 proof
    );
    event Correction(uint256 indexed board, uint32 indexed correctedIndex, uint32 index, string reason);
    event Sold(uint256 indexed board, address indexed buyer, uint64 t);
    event SponsorshipStarted(
        uint256 indexed board,
        uint32 indexed number,
        string sponsorName,
        address sponsorWallet,
        string artistName,
        address artistWallet,
        bytes32 designHash,
        string designURI,
        uint64 startDate,
        uint64 endDate
    );
    event SponsorshipEnded(uint256 indexed board, uint32 indexed number, uint64 t);

    error UnknownBoard(uint256 board);
    error UnknownType(uint8 eventType);
    error BatchSize();
    error UnknownIndex(uint256 board, uint32 index);
    error NoSponsorship(uint256 board);
    error BadDates();
    error BadText();
    error NotAllowed(address account, uint8 eventType);

    constructor(address admin, string memory imageURI) ERC721("Grab&Surf Board", "KORKO") {
        treasury = admin;
        defaultImageURI = imageURI;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(REPAIRER_ROLE, admin);
        _grantRole(SPONSOR_MANAGER_ROLE, admin);
    }

    /// Same question as V1's operateurs(address): can this wallet write the life log?
    function operators(address account) external view returns (bool) {
        return hasRole(OPERATOR_ROLE, account);
    }

    function setDefaultImageURI(string calldata imageURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        defaultImageURI = imageURI;
    }

    // ------------------------------------------------------------------ life log

    /// Mint the NFT of a board (id = beacon number: korko-07 -> 7).
    function putIntoService(uint256 board, bytes1 home, uint64 t) external onlyRole(OPERATOR_ROLE) {
        _mint(treasury, board);
        states[board].home = home;
        _log(board, SERVICE, home, t, bytes32(0));
    }

    function record(uint256 board, uint8 eventType, bytes1 station, uint64 t, bytes32 proof) public {
        _checkWriter(eventType);
        if (_ownerOf(board) == address(0)) revert UnknownBoard(board);
        if (eventType == SERVICE || eventType == CORRECTION || eventType == SOLD || eventType >= NB_TYPES) {
            revert UnknownType(eventType);
        }
        _log(board, eventType, station, t, proof);
    }

    /// Several events in one transaction (catching up after a network cut).
    function recordBatch(
        uint256[] calldata boards,
        uint8[] calldata types,
        bytes1[] calldata stations,
        uint64[] calldata ts,
        bytes32[] calldata proofs
    ) external {
        uint256 n = boards.length;
        if (types.length != n || stations.length != n || ts.length != n || proofs.length != n) revert BatchSize();
        for (uint256 i = 0; i < n; i++) {
            record(boards[i], types[i], stations[i], ts[i], proofs[i]);
        }
    }

    /// A wrong event stays visible; this entry says it was wrong and where the board really is.
    function correct(uint256 board, uint32 correctedIndex, bytes1 station, uint64 t, string calldata reason)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (_ownerOf(board) == address(0)) revert UnknownBoard(board);
        if (correctedIndex >= states[board].events) revert UnknownIndex(board, correctedIndex);
        _checkText(reason);
        uint32 index = states[board].events;
        _log(board, CORRECTION, station, t, bytes32(uint256(correctedIndex)));
        emit Correction(board, correctedIndex, index, reason);
    }

    /// Implicit purchase confirmed by the operator: the NFT goes to the customer's wallet.
    function sellTo(uint256 board, address buyer, uint64 t) external onlyRole(OPERATOR_ROLE) {
        address holder = _ownerOf(board);
        if (holder == address(0)) revert UnknownBoard(board);
        _transfer(holder, buyer, board);
        _log(board, SOLD, 0x00, t, bytes32(uint256(uint160(buyer))));
        emit Sold(board, buyer, t);
    }

    function _checkWriter(uint8 eventType) internal view {
        if (hasRole(OPERATOR_ROLE, msg.sender)) return;
        if ((eventType == REPAIR || eventType == REFURBISH || eventType == INSPECTION)
            && hasRole(REPAIRER_ROLE, msg.sender)) return;
        revert NotAllowed(msg.sender, eventType);
    }

    function _log(uint256 board, uint8 eventType, bytes1 station, uint64 t, bytes32 proof) internal {
        BoardState storage s = states[board];
        if (eventType == DEPART) {
            s.departures += 1;
            s.station = 0x00;
        } else if (eventType == LOST || eventType == SOLD) {
            s.station = 0x00;
        } else if (eventType != INSPECTION) {
            s.station = station;
        }
        s.lastType = eventType;
        s.lastT = t;
        s.lastProof = proof;
        emit BoardEvent(board, eventType, station, t, s.events, proof);
        s.events += 1;
    }

    // ------------------------------------------------------------------ sponsorship

    function startSponsorship(
        uint256 board,
        string calldata sponsorName,
        address sponsorWallet,
        string calldata artistName,
        address artistWallet,
        bytes32 designHash,
        string calldata designURI,
        uint64 startDate,
        uint64 endDate
    ) external onlyRole(SPONSOR_MANAGER_ROLE) {
        if (_ownerOf(board) == address(0)) revert UnknownBoard(board);
        if (endDate != 0 && endDate < startDate) revert BadDates();
        _checkText(sponsorName);
        _checkText(artistName);
        _checkText(designURI);
        _sponsorships[board] = Sponsorship(
            sponsorName, sponsorWallet, artistName, artistWallet, designHash, designURI, startDate, endDate, true
        );
        sponsorshipCount[board] += 1;
        emit SponsorshipStarted(
            board, sponsorshipCount[board], sponsorName, sponsorWallet, artistName, artistWallet,
            designHash, designURI, startDate, endDate
        );
    }

    function endSponsorship(uint256 board, uint64 t) external onlyRole(SPONSOR_MANAGER_ROLE) {
        if (!_sponsorships[board].active) revert NoSponsorship(board);
        _sponsorships[board].active = false;
        emit SponsorshipEnded(board, sponsorshipCount[board], t);
    }

    function sponsorship(uint256 board) external view returns (Sponsorship memory) {
        return _sponsorships[board];
    }

    /// Texts are embedded in JSON metadata: no quote, backslash or control character.
    function _checkText(string calldata text) internal pure {
        bytes calldata b = bytes(text);
        if (b.length > 200) revert BadText();
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == "\\" || uint8(b[i]) < 0x20) revert BadText();
        }
    }

    // ------------------------------------------------------------------ reading

    function status(uint256 board) public view returns (string memory) {
        uint8 d = states[board].lastType;
        if (d == DEPART) return "at sea";
        if (d == LOST) return "lost";
        if (d == SOLD) return "sold";
        if (d == REPAIR) return "in the workshop";
        if (d == FOREIGN_RETURN) return "away from home";
        return "at the rack";
    }

    /// Metadata generated on-chain, readable in any wallet or explorer.
    function tokenURI(uint256 board) public view override returns (string memory) {
        _requireOwned(board);
        BoardState memory s = states[board];
        Sponsorship memory sp = _sponsorships[board];
        string memory name = string.concat("Grab&Surf #", board < 10 ? "0" : "", board.toString());
        string memory image = sp.active && bytes(sp.designURI).length > 0 ? sp.designURI : defaultImageURI;
        string memory head = string.concat(
            '{"name":"', name,
            '","description":"Cork surfboard with an on-chain life log: rides, returns, inspections, repairs.",',
            '"image":"', image, '","attributes":[{"trait_type":"Home station","value":"', _letter(s.home), '"},'
        );
        string memory body = string.concat(
            '{"trait_type":"Status","value":"', status(board), '"},',
            '{"trait_type":"Rides","value":', uint256(s.departures).toString(), '},',
            '{"trait_type":"Events","value":', uint256(s.events).toString(), '}'
        );
        string memory art = sp.active
            ? string.concat(',{"trait_type":"Artist","value":"', sp.artistName,
                '"},{"trait_type":"Sponsor","value":"', sp.sponsorName, '"}')
            : "";
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(head, body, art, "]}"))));
    }

    function _letter(bytes1 b) internal pure returns (string memory) {
        bytes memory out = new bytes(1);
        out[0] = b;
        return string(out);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
