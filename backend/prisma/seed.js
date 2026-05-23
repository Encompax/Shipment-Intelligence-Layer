"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const roles = [
        { name: "admin" },
        { name: "manager" },
        { name: "supervisor" },
        { name: "associate" }
    ];
    const permissions = [
        { name: "view_datasources" },
        { name: "edit_datasources" },
        { name: "view_dashboard" },
        { name: "manage_users" }
    ];
    for (const r of roles)
        await prisma.role.create({ data: r });
    for (const p of permissions)
        await prisma.permission.create({ data: p });
    console.log("RBAC seed created");
}
main();
