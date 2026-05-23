"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const ts = () => new Date().toISOString();
exports.logger = {
    info: (...args) => console.log(`[${ts()}] INFO `, ...args),
    warn: (...args) => console.warn(`[${ts()}] WARN `, ...args),
    error: (...args) => console.error(`[${ts()}] ERROR`, ...args),
};
