"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    port: Number(process.env.PORT || 3001),
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
};
