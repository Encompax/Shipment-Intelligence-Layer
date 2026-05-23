"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../lib/logger");
function errorHandler(err, req, res, _next) {
    logger_1.logger.error(err);
    res.status(500).json({ message: 'An unexpected error occurred' });
}
