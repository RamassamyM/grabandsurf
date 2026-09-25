// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// KorkoPlanche : chaque planche KORKO est un NFT, et son carnet de vie est on-chain.
//
// Ce qui va sur la chaîne : la planche, la station, le type d'événement, l'heure.
// Ce qui n'y va JAMAIS : le client, son téléphone, sa carte (RGPD : la chaîne
// n'oublie rien).
//
// Seuls les opérateurs (le wallet du cloud KORKO) écrivent. L'usager ne signe
// rien, ne paie aucun frais et ne voit jamais la blockchain.

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract KorkoPlanche is ERC721, Ownable {
    using Strings for uint256;

    // Types d'événements du carnet de vie
    uint8 public constant MISE_EN_SERVICE = 0;
    uint8 public constant DEPART = 1;
    uint8 public constant RETOUR = 2;
    uint8 public constant ETRANGERE = 3;          // rendue à une autre station
    uint8 public constant REPARATION = 4;
    uint8 public constant RECONDITIONNEMENT = 5;
    uint8 public constant PERDUE = 6;             // jamais rendue, caution débitée
    uint8 public constant NB_TYPES = 7;

    struct Etat {
        bytes1 origine;        // station de rattachement : "A", "B", "C"
        bytes1 station;        // dernière station connue ("" si en mer)
        uint8 dernierType;
        uint64 dernierT;       // champ t du flux (secondes)
        uint32 sorties;
        uint32 evenements;
    }

    mapping(uint256 => Etat) public etats;
    mapping(address => bool) public operateurs;

    event Evenement(
        uint256 indexed planche,
        uint8 indexed typeEvenement,
        bytes1 station,
        uint64 t,
        uint32 index
    );
    event Operateur(address indexed compte, bool actif);

    error PasOperateur();
    error PlancheInconnue(uint256 planche);
    error TypeInconnu(uint8 typeEvenement);
    error TailleLot();

    modifier seulementOperateur() {
        if (!operateurs[msg.sender]) revert PasOperateur();
        _;
    }

    constructor(address proprietaire) ERC721("KORKO Planche", "KORKO") Ownable(proprietaire) {
        operateurs[proprietaire] = true;
        emit Operateur(proprietaire, true);
    }

    function definirOperateur(address compte, bool actif) external onlyOwner {
        operateurs[compte] = actif;
        emit Operateur(compte, actif);
    }

    /// Crée le NFT d'une planche (id = numéro de balise : korko-07 -> 7).
    function mettreEnService(uint256 planche, bytes1 origine, uint64 t) public seulementOperateur {
        _mint(owner(), planche);
        etats[planche].origine = origine;
        _enregistrer(planche, MISE_EN_SERVICE, origine, t);
    }

    function enregistrer(uint256 planche, uint8 typeEvenement, bytes1 station, uint64 t)
        public
        seulementOperateur
    {
        if (_ownerOf(planche) == address(0)) revert PlancheInconnue(planche);
        if (typeEvenement == MISE_EN_SERVICE || typeEvenement >= NB_TYPES) revert TypeInconnu(typeEvenement);
        _enregistrer(planche, typeEvenement, station, t);
    }

    /// Plusieurs événements en une transaction (rattrapage après coupure).
    function enregistrerLot(
        uint256[] calldata planches,
        uint8[] calldata types,
        bytes1[] calldata stations,
        uint64[] calldata ts
    ) external seulementOperateur {
        uint256 n = planches.length;
        if (types.length != n || stations.length != n || ts.length != n) revert TailleLot();
        for (uint256 i = 0; i < n; i++) {
            enregistrer(planches[i], types[i], stations[i], ts[i]);
        }
    }

    function _enregistrer(uint256 planche, uint8 typeEvenement, bytes1 station, uint64 t) internal {
        Etat storage e = etats[planche];
        if (typeEvenement == DEPART) {
            e.sorties += 1;
            e.station = 0x00;
        } else if (typeEvenement == PERDUE) {
            e.station = 0x00;
        } else {
            e.station = station;
        }
        e.dernierType = typeEvenement;
        e.dernierT = t;
        emit Evenement(planche, typeEvenement, station, t, e.evenements);
        e.evenements += 1;
    }

    // ---------------------------------------------------------------- lecture

    function statut(uint256 planche) public view returns (string memory) {
        uint8 d = etats[planche].dernierType;
        if (d == DEPART) return "en mer";
        if (d == PERDUE) return "perdue";
        if (d == REPARATION) return "en atelier";
        if (d == ETRANGERE) return "hors base";
        return "au ratelier";
    }

    /// Métadonnées générées on-chain : lisibles dans un wallet ou un explorateur.
    function tokenURI(uint256 planche) public view override returns (string memory) {
        _requireOwned(planche);
        Etat memory e = etats[planche];
        string memory nom = string.concat("KORKO #", planche < 10 ? "0" : "", planche.toString());
        string memory tete = string.concat(
            '{"name":"', nom,
            '","description":"Planche de surf en liege KORKO. Carnet de vie on-chain : sorties, retours, reparations.",',
            '"attributes":[{"trait_type":"Station d\'origine","value":"', _lettre(e.origine), '"},'
        );
        string memory corps = string.concat(
            '{"trait_type":"Statut","value":"', statut(planche), '"},',
            '{"trait_type":"Sorties","value":', uint256(e.sorties).toString(), '},',
            '{"trait_type":"Evenements","value":', uint256(e.evenements).toString(), '}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(tete, corps))));
    }

    function _lettre(bytes1 b) internal pure returns (string memory) {
        bytes memory s = new bytes(1);
        s[0] = b;
        return string(s);
    }
}
