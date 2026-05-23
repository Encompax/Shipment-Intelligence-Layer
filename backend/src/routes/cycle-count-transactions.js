"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCycleCountRoutes = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
// Department mappings from Stock Count format (e.g., "WK 9 FG 1 26" → "FG" = Finished Goods)
const DEPARTMENTS = {
    FG: "Finished Goods",
    RM: "Raw Materials",
    ASTRL: "Astroneal",
    HI2: "Hi-Tech II",
    RAYTOR: "Raytor",
    KITOGRAM: "Kitogram",
    LITER: "Liter",
    USER: "User Defined",
};
const DEPARTMENT_ACRONYMS = Object.keys(DEPARTMENTS);
const WEEKS = [9, 10, 11, 12, 13];
const USERS = ["csraytor", "rcraytor", "csraytor", "agarito", "kitogram", "lizer"];
const LOCATIONS = ["MAIN", "LABEL-ROOM", "QUARANTINE", "WK-11-BL", "WK-11-RL", "WK-11-LS", "WK-11-RAW", "RECEIVING"];
function generateMockCycleCountTransactions() {
    const transactions = [];
    const itemData = [
        { item: "LBL-P222-MD", desc: "Label | Prelab | Rapid Differential (Blue #) | 3oz | 4-in", size: "LBL", um: "Each" },
        { item: "LBL-P322-4D", desc: "Label | Prelab | Rapid Differential Fixative #2 | 3oz | 2-25in", size: "LBL", um: "Each" },
        { item: "LBL-P332-3AD", desc: "Label | Prelab | Rapid Differential Part #2 | 3oz | 40-in", size: "LBL", um: "Each" },
        { item: "LBL-P332-3AD", desc: "Label | Prelab | Rapid Differential Part #2 | 3oz | 40-in", size: "LBL", um: "Each" },
        { item: "LBL-BL-2", desc: "Label | Blank", size: "LBL", um: "Each" },
        { item: "LBL-BL-15M", desc: "Label | Blank | 15 Millimeter", size: "LBL", um: "Each" },
        { item: "LBL-JL-5LG", desc: "Label | Jar Label", size: "LBL", um: "Each" },
        { item: "LBL-AZ-1234", desc: "Label | AZ Label", size: "LBL", um: "Each" },
        { item: "40K031", desc: "Formatin Neutral Buffered, 1996, Lgst, Sample", size: "40ml", um: "Bottle" },
        { item: "400004", desc: "Formalin", size: "QT", um: "Bottle" },
        { item: "RM8324", desc: "Preservant", size: "CS", um: "Each" },
        { item: "RM8314", desc: "3-Methoxypropylamine/methylamine", size: "CS", um: "Kg" },
        { item: "RM4213", desc: "2-Phenoxyethanol", size: "CS", um: "Kg" },
    ];
    let transactionId = 1;
    // Generate for each department and week
    DEPARTMENT_ACRONYMS.slice(0, 6).forEach((dept) => {
        WEEKS.forEach((week) => {
            const itemsPerWeek = 5 + Math.floor(Math.random() * 8);
            for (let i = 0; i < itemsPerWeek; i++) {
                const item = itemData[Math.floor(Math.random() * itemData.length)];
                const previousQty = Math.floor(Math.random() * 5000) + 100;
                const variance = Math.floor(Math.random() * 200) - 100;
                const classifiedQty = previousQty + variance;
                const stockCount = `WK ${week} ${dept} 1 26`;
                const dayOfMonth = 1 + Math.floor(Math.random() * 28);
                const hour = 7 + Math.floor(Math.random() * 10);
                const minute = Math.floor(Math.random() * 60);
                const dateStr = `5/1/2025 ${hour}:${minute.toString().padStart(2, "0")} PM`;
                transactions.push({
                    date_time: dateStr,
                    stock_count: stockCount,
                    status: Math.random() > 0.15 ? "Completed" : "In Progress",
                    section: ["ASTRL", "HI2", "raytor", "agiroto"].includes(dept) ? dept : "ASTRL",
                    profile: "Selected",
                    prefix: item.size || "LBL",
                    dollar: "",
                    user_name: USERS[Math.floor(Math.random() * USERS.length)],
                    item_number: item.item,
                    item_description: item.desc,
                    size: item.size || "LBL",
                    bin: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
                    lot: `${item.item.substring(0, 2).toUpperCase()}-${String(week).padStart(2, "0")}-${String(transactionId).padStart(4, "0")}`,
                    serial: "",
                    unit_of_measure: item.um,
                    previous_qty: previousQty,
                    classified_qty: classifiedQty,
                    submitted_qty: classifiedQty,
                    stock_count_action: Math.abs(variance) < 50 ? "Additive" : "Analyze",
                    stock_count_exception: Math.abs(variance) > 150 ? "Large Variance" : undefined,
                    reason: Math.abs(variance) > 150 ? "Physical count differs significantly from system" : undefined,
                });
                transactionId++;
            }
        });
    });
    return transactions.sort((a, b) => {
        const aDate = new Date(a.date_time);
        const bDate = new Date(b.date_time);
        return bDate.getTime() - aDate.getTime();
    });
}
// GET /api/cycle-counts/departments - List all departments with available weeks
router.get("/departments", (req, res) => {
    const mockTransactions = generateMockCycleCountTransactions();
    const departments = {};
    // Extract unique departments and weeks
    mockTransactions.forEach((t) => {
        const match = t.stock_count.match(/WK (\d+) ([A-Z]+)/);
        if (match) {
            const week = parseInt(match[1], 10);
            const dept = match[2];
            if (!departments[dept])
                departments[dept] = new Set();
            departments[dept].add(week);
        }
    });
    const result = Object.entries(departments).map(([dept, weeks]) => ({
        department: dept,
        department_name: DEPARTMENTS[dept] || dept,
        weeks_available: Array.from(weeks).sort((a, b) => b - a),
        transactions_count: mockTransactions.filter((t) => t.stock_count.includes(dept)).length,
    }));
    res.json(result.sort((a, b) => a.department.localeCompare(b.department)));
});
// GET /api/cycle-counts/:department/:week - Get all transactions for a department and week
router.get("/:department/:week", (req, res) => {
    const { department, week } = req.params;
    const weekNum = parseInt(week, 10);
    if (!DEPARTMENT_ACRONYMS.includes(department.toUpperCase())) {
        return res.status(400).json({ error: "Invalid department" });
    }
    const mockTransactions = generateMockCycleCountTransactions();
    const filtered = mockTransactions.filter((t) => {
        const match = t.stock_count.match(/WK (\d+) ([A-Z]+)/);
        return match && parseInt(match[1], 10) === weekNum && match[2] === department.toUpperCase();
    });
    if (filtered.length === 0) {
        return res.status(404).json({ error: "No transactions found for this department and week" });
    }
    const completed = filtered.filter((t) => t.status === "Completed").length;
    const inProgress = filtered.filter((t) => t.status === "In Progress").length;
    const varianceCount = filtered.filter((t) => t.stock_count_exception).length;
    const result = {
        department: department.toUpperCase(),
        week: weekNum,
        stock_count: `WK ${weekNum} ${department.toUpperCase()} 1 26`,
        transactions: filtered,
        summary: {
            total_items: filtered.length,
            completed,
            in_progress: inProgress,
            accuracy_variance_count: varianceCount,
        },
    };
    res.json(result);
});
// GET /api/cycle-counts/summary/:department - Get summary stats for a department across all weeks
router.get("/summary/:department", (req, res) => {
    const { department } = req.params;
    if (!DEPARTMENT_ACRONYMS.includes(department.toUpperCase())) {
        return res.status(400).json({ error: "Invalid department" });
    }
    const mockTransactions = generateMockCycleCountTransactions();
    const filtered = mockTransactions.filter((t) => t.stock_count.includes(department.toUpperCase()));
    if (filtered.length === 0) {
        return res.status(404).json({ error: "No transactions found for this department" });
    }
    const completed = filtered.filter((t) => t.status === "Completed").length;
    const varianceItems = filtered.filter((t) => t.stock_count_exception);
    const avgVariance = varianceItems.length > 0
        ? varianceItems.reduce((sum, t) => sum + Math.abs((t.classified_qty || 0) - (t.previous_qty || 0)), 0) / varianceItems.length
        : 0;
    res.json({
        department: department.toUpperCase(),
        department_name: DEPARTMENTS[department.toUpperCase()] || department,
        total_transactions: filtered.length,
        completed_count: completed,
        in_progress_count: filtered.length - completed,
        completion_rate: ((completed / filtered.length) * 100).toFixed(1),
        items_with_variance: varianceItems.length,
        average_variance: avgVariance.toFixed(0),
    });
});
// MOCK DATA — no CycleCountTransaction model in Prisma schema.
// Requires GP Stock Count export integration (Phase 2).
// Do not replace until a schema model is defined.
const registerCycleCountRoutes = (app) => {
    app.use("/api/cycle-counts", router);
};
exports.registerCycleCountRoutes = registerCycleCountRoutes;
