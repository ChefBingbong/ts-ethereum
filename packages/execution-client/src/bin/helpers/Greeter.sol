// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Greeter {
    string greeting;
    event GreetingSet(string greeting);

    constructor(string memory _greeting) {
        greeting = _greeting;
        emit GreetingSet(greeting);
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
        emit GreetingSet(greeting);
    }

    function greet() public view returns (string memory) {
        return greeting;
    }
}

