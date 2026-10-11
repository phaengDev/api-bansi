"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMainMenus = void 0;
const mainMenuModel_1 = __importDefault(require("../models/mainMenuModel"));
/** GET /menu/main — ເມນູໜ້າ desktop ບັນຊີ (types 2) ພ້ອມສະຖານະລັອກ; ບໍ່ສົ່ງ hash ລະຫັດອອກໄປ */
const getMainMenus = async (req, res) => {
    try {
        const menus = await mainMenuModel_1.default.scope("withPassword").findAll({
            where: { status: 1, types: 2 },
            order: [["_uuid", "ASC"]],
        });
        const data = menus.map((menu) => {
            const { password, ...rest } = menu.get({ plain: true });
            return { ...rest, locked: !!password };
        });
        res.status(200).json({ data });
    }
    catch (error) {
        console.error("GET MAIN MENUS ERROR:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getMainMenus = getMainMenus;
