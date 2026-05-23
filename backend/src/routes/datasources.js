"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDatasourceRoutes = registerDatasourceRoutes;
const express_1 = require("express");
const prisma_1 = require("../lib/prisma"); // adjust path if needed
function registerDatasourceRoutes(app) {
    const router = (0, express_1.Router)();
    // GET /api/datasources
    router.get("/", async (req, res) => {
        const list = await prisma_1.prisma.datasource.findMany({
            orderBy: { name: "asc" },
        });
        res.json(list);
    });
    // POST /api/datasources
    router.post("/", async (req, res) => {
        const { name, type, description } = req.body;
        if (!name || !type) {
            return res.status(400).json({ message: "Name and type are required" });
        }
        const created = await prisma_1.prisma.datasource.create({
            data: {
                name,
                type,
                description: description !== null && description !== void 0 ? description : null,
            },
        });
        res.status(201).json(created);
    });
    // Mount route
    app.use("/api/datasources", router);
}
