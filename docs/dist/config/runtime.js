"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulationsEnabled = simulationsEnabled;
function simulationsEnabled(environment = process.env) {
    return environment.NODE_ENV !== 'production' || environment.SIMULATION_MODE === 'true';
}
