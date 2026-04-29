// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TalosRegistry {
    struct Patron {
        uint32 creatorShare;
        uint32 investorShare;
        uint32 treasuryShare;
        string creatorAddr;
        string investorAddr;
        string treasuryAddr;
    }

    struct Kernel {
        uint256 approvalThreshold;
        uint256 gtmBudget;
        uint256 minPatronPulse;
    }

    struct Pulse {
        uint256 totalSupply;
        uint256 priceA0gi;
        string tokenSymbol;
    }

    struct Talos {
        uint64 id;
        string name;
        string category;
        string description;
        string creator;
        Patron patron;
        Kernel kernel;
        Pulse pulse;
        uint64 createdAt;
        bool active;
    }

    address public admin;
    address public protocolWallet;
    uint64 public protocolFeeBps;
    uint64 public nextId;

    mapping(uint64 => Talos) private registry;
    mapping(uint64 => address) private creatorEvm;

    event TalosCreated(uint64 indexed talosId, string creator);
    event TalosUpdated(uint64 indexed talosId, string field);
    event TalosDeactivated(uint64 indexed talosId);

    error Unauthorized();
    error TalosNotFound();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address _protocolWallet, uint64 _protocolFeeBps) {
        admin = msg.sender;
        protocolWallet = _protocolWallet;
        protocolFeeBps = _protocolFeeBps;
        nextId = 1;
    }

    function createTalos(
        string calldata name,
        string calldata category,
        string calldata description,
        Patron calldata patron,
        Kernel calldata kernel,
        Pulse calldata pulse
    ) external returns (uint64 talosId) {
        talosId = nextId++;
        registry[talosId] = Talos({
            id: talosId,
            name: name,
            category: category,
            description: description,
            creator: patron.creatorAddr,
            patron: patron,
            kernel: kernel,
            pulse: pulse,
            createdAt: uint64(block.timestamp),
            active: true
        });
        creatorEvm[talosId] = msg.sender;
        emit TalosCreated(talosId, patron.creatorAddr);
    }

    function updatePatron(uint64 talosId, Patron calldata patron) external {
        _loadTalos(talosId);
        if (!_isCreatorOrAdmin(talosId)) revert Unauthorized();
        registry[talosId].patron = patron;
        emit TalosUpdated(talosId, "patron");
    }

    function updateKernel(uint64 talosId, Kernel calldata kernel) external {
        _loadTalos(talosId);
        if (!_isCreatorOrAdmin(talosId)) revert Unauthorized();
        registry[talosId].kernel = kernel;
        emit TalosUpdated(talosId, "kernel");
    }

    function updatePulse(uint64 talosId, Pulse calldata pulse) external {
        _loadTalos(talosId);
        if (!_isCreatorOrAdmin(talosId)) revert Unauthorized();
        registry[talosId].pulse = pulse;
        emit TalosUpdated(talosId, "pulse");
    }

    function deactivateTalos(uint64 talosId) external {
        _loadTalos(talosId);
        if (!_isCreatorOrAdmin(talosId)) revert Unauthorized();
        registry[talosId].active = false;
        emit TalosDeactivated(talosId);
    }

    function setProtocolWallet(address wallet) external onlyAdmin {
        protocolWallet = wallet;
    }

    function setProtocolFeeBps(uint64 feeBps) external onlyAdmin {
        protocolFeeBps = feeBps;
    }

    function getTalos(uint64 talosId) external view returns (Talos memory) {
        if (!_exists(talosId)) revert TalosNotFound();
        return registry[talosId];
    }

    function creatorOf(uint64 talosId) external view returns (string memory) {
        if (!_exists(talosId)) revert TalosNotFound();
        return registry[talosId].creator;
    }

    function isActive(uint64 talosId) external view returns (bool) {
        if (!_exists(talosId)) revert TalosNotFound();
        return registry[talosId].active;
    }

    function _loadTalos(uint64 talosId) internal view returns (Talos storage) {
        if (!_exists(talosId)) revert TalosNotFound();
        return registry[talosId];
    }

    function _exists(uint64 talosId) internal view returns (bool) {
        return talosId > 0 && talosId < nextId;
    }

    function _isCreatorOrAdmin(uint64 talosId) internal view returns (bool) {
        return msg.sender == admin || msg.sender == creatorEvm[talosId];
    }
}
