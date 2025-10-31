// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VeriLeaf Claims & Verification
/// @notice Stores user land-claim polygons (as GeoJSON bytes) and allows a verifier to submit impact scores.
contract VeriLeafClaims {
    struct Claim {
        bytes geojson;         // Raw GeoJSON bytes for the polygon
        string locationName;   // Human-readable location name
        uint256 timestamp;     // When the claim was registered
        bool exists;           // Whether a claim exists for this user
    }

    // Owner and Verifier roles
    address public owner;
    address public verifier; // backend/service wallet authorized to submit scores

    mapping(address => Claim) public claims;     // user => claim
    mapping(address => uint256) public userScores; // user => last submitted impact score (0-100)

    event ClaimRegistered(address indexed user, string locationName);
    event ImpactScoreSubmitted(address indexed user, uint256 impactScore, address indexed by);
    event VerifierUpdated(address indexed newVerifier);

    constructor(address _verifier) {
        owner = msg.sender;
        verifier = _verifier == address(0) ? msg.sender : _verifier;
        emit VerifierUpdated(verifier);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "Not verifier");
        _;
    }

    /// @notice Update the verifier address (service account)
    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Zero address");
        verifier = _verifier;
        emit VerifierUpdated(_verifier);
    }

    /// @notice Register or update the caller's land claim polygon
    /// @param geojson Raw GeoJSON bytes encoding the polygon feature
    /// @param locationName Human-friendly location name
    function registerClaim(bytes memory geojson, string memory locationName) external {
        require(geojson.length > 0, "Empty geojson");
        require(bytes(locationName).length > 0, "Empty name");

        claims[msg.sender] = Claim({
            geojson: geojson,
            locationName: locationName,
            timestamp: block.timestamp,
            exists: true
        });

        emit ClaimRegistered(msg.sender, locationName);
    }

    /// @notice Submit a user's impact score on-chain
    /// @dev Intended to be called by a verifier backend service
    function submitImpactScore(address user, uint256 impactScore) external onlyVerifier {
        require(user != address(0), "Zero user");
        require(impactScore <= 100, "Score out of range");
        userScores[user] = impactScore;
        emit ImpactScoreSubmitted(user, impactScore, msg.sender);
    }

    /// @notice Read back claim details for a user
    function getClaim(address user)
        external
        view
        returns (bytes memory geojson, string memory locationName, uint256 timestamp, bool exists)
    {
        Claim memory c = claims[user];
        return (c.geojson, c.locationName, c.timestamp, c.exists);
    }
}
