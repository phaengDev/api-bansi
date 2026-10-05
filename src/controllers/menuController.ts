import { Request, Response } from "express";
import MainMenu from "../models/mainMenuModel";

/** GET /menu/main — ເມນູໜ້າ desktop ບັນຊີ (types 2) ພ້ອມສະຖານະລັອກ; ບໍ່ສົ່ງ hash ລະຫັດອອກໄປ */
export const getMainMenus = async (req: Request, res: Response) => {
    try {
        const menus = await MainMenu.scope("withPassword").findAll({
            where: { status: 1, types: 2 },
            order: [["_uuid", "ASC"]],
        });
        const data = menus.map((menu) => {
            const { password, ...rest } = menu.get({ plain: true });
            return { ...rest, locked: !!password };
        });
        res.status(200).json({ data });
    } catch (error) {
        console.error("GET MAIN MENUS ERROR:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
