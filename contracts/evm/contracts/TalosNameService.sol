// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TalosNameService {
    mapping(string => uint64) private nameRecord;
    mapping(uint64 => string) private talosName;

    event NameRegistered(uint64 indexed talosId, string name);

    error NameTaken();
    error InvalidName();
    error AlreadyHasName();

    function registerName(uint64 talosId, string calldata name) external {
        if (!_validateName(name)) revert InvalidName();
        if (nameRecord[name] != 0) revert NameTaken();
        if (bytes(talosName[talosId]).length != 0) revert AlreadyHasName();

        nameRecord[name] = talosId;
        talosName[talosId] = name;
        emit NameRegistered(talosId, name);
    }

    function resolveName(string calldata name) external view returns (uint64) {
        return nameRecord[name];
    }

    function nameOf(uint64 talosId) external view returns (string memory) {
        return talosName[talosId];
    }

    function isNameAvailable(string calldata name) external view returns (bool) {
        if (!_validateName(name)) return false;
        return nameRecord[name] == 0;
    }

    function hasName(uint64 talosId) external view returns (bool) {
        return bytes(talosName[talosId]).length != 0;
    }

    function _validateName(string memory name) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 3 || len > 32) return false;
        if (!_isAlphanumeric(b[0]) || !_isAlphanumeric(b[len - 1])) return false;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLower = (c >= 0x61 && c <= 0x7A);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2D);
            if (!isLower && !isDigit && !isHyphen) return false;
            if (isHyphen && i + 1 < len && b[i + 1] == 0x2D) return false;
        }
        return true;
    }

    function _isAlphanumeric(bytes1 c) internal pure returns (bool) {
        return (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39);
    }
}
