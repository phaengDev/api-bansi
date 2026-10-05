import { Request, Response } from "express";
import { maxid } from "../../utils";
import FinanceCategories from "../../models/typeIncomeModel";
interface QueryParams {
    limit?: string;
    skip?: string;
    orderBy?: string;
    order?: string;
}
export const getTypeInexp = async (
    req: Request<{ id: string }, {}, {}, QueryParams>,
    res: Response
): Promise<void> => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
        const typestatus = req.params.id;
        const { rows, count } = await FinanceCategories.findAndCountAll({
            where: { typestatus: typestatus },
            limit,
            offset: skip,
            order: [[orderBy, order]],
        });

        res.status(200).json({
            data: rows,
            total: count,
            limit,
            skip,
            orderBy,
            order
        });
    } catch (error) {
        res.status(500).json({ message: "Error getting typeinexp", error });
    }
};

// =========create typeinexp
export const createTypeInexp = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const newid = await maxid(FinanceCategories, '_uuid')
        if (!req.body.createdAt) {
            req.body.createdAt =new Date();
        }
        req.body._uuid = newid
        const typeinexp = await FinanceCategories.create(req.body);
        if (!typeinexp) {
            res.status(400).json({ message: "Error creating typeinexp" });
            return
        }
        res.status(200).json({ message: "Successfully creating typeinexp", data: typeinexp });
    } catch (error) {
        res.status(500).json({ message: "Error creating typeinexp", error });
    }
};
// ============ update typeinexp
export const updateTypeInexp = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const id = atob(req.params.id);
        const typeinexp = await FinanceCategories.findByPk(id);
        if (!typeinexp) {
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        // ໃຊ້ instance.update — FinanceCategories.update() ບໍ່ມີ where ຈະແກ້ທຸກແຖວ
        await typeinexp.update(req.body);
        res.status(200).json({ 
            message: "Successfully updating typeinexp", 
            data: typeinexp 
        });
    } catch (error) {
        res.status(500).json({ message: "Error updating typeinexp", error });
    }
};

// ========= delete typeinexp
export const deleteTypeInexp = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const  id  = atob(req.params.id);
        const typeinexp = await FinanceCategories.findByPk(id);
        if (!typeinexp) {
            res.status(404).json({ message: 'TypeInexp not found' });
            return;
        }
        await typeinexp.destroy();

        res.status(200).json({
            message: 'Successfully deleted typeinexp',
        });
    } catch (error) {
        console.error('Delete typeinexp error:', error);
        res.status(500).json({
            message: 'Error deleting typeinexp',
            error,
        });
    }
};

// ========== get typeinexp by id
export const getTypeInexpOption = async (req: Request, res: Response) => {
    try {
        const typestatus = req.params.id;
        const typeinexp = await FinanceCategories.findAll({
            where: { typestatus: typestatus, status: 1 },
        });
        if (!typeinexp) {
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        res.status(200).json({ message: "Successfully fetching typeinexp", data: typeinexp });
    } catch (error) {
        res.status(500).json({ message: "Error fetching typeinexp", error });
    }
};