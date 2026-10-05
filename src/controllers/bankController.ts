import { Request, Response } from "express";
import { fn, col, literal } from "sequelize";
import { maxid, url } from "../utils";
import Banks from "../models/bankModel";
import { deleteFile } from "../utils/uploadFile";
interface QueryParams {
    limit?: string;
    skip?: string;
    orderBy?: string;
    order?: string;
}
const getUploadFileName = (req: Request): string | undefined => {
    if (req.file) return req.file.filename;

    const files = req.files;
    if (!files) return undefined;

    if (Array.isArray(files)) {
        return files[0]?.filename;
    }

    return files.logo?.[0]?.filename || files.logos?.[0]?.filename;
};

// ========== create bank =======
export const createBank = async (req: Request, res: Response) => {
    try {
        const new_uuid = await maxid(Banks, "_uuid");
        const logo = getUploadFileName(req);

        const bank = await Banks.create({
            ...req.body,
            _uuid: new_uuid,
            logo: logo || req.body.logo || "",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        res.status(200).json({ message: "Bank created successfully", data: bank });
    } catch (error) {
        res.status(500).json({ error: "Failed to create bank" });
    }
};

// ========== update bank =======
export const updateBank = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const bank_uuid = atob(req.params.id);
        const bank = await Banks.findByPk(bank_uuid);

        if (!bank) {
            return res.status(404).json({ error: "Bank not found" });
        }

        const logo = getUploadFileName(req);
        const payload = {
            ...req.body,
            updatedAt: new Date(),
        };

        if (logo) {
            if (bank.logo) {
                deleteFile("logo", bank.logo);
            }
            payload.logo = logo;
        } else {
            delete payload.logo;
        }

        const [updated] = await Banks.update(payload, {
            where: { _uuid: bank_uuid },
        });

        if (!updated) return res.status(404).json({ error: "Bank not found" });

        const updatedBank = await Banks.findByPk(bank_uuid);
        res.status(200).json({ message: "Bank updated successfully", data: updatedBank });
    } catch (error) {
        res.status(500).json({ error: "Failed to update bank" });
    }
};

// ========== delete bank =======
export const deleteBank = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const bank_uuid = atob(req.params.id);
        const bank = await Banks.findByPk(bank_uuid);

        if (!bank) {
            return res.status(404).json({ error: "Bank not found" });
        }

        if (bank.logo) {
            deleteFile("logo", bank.logo);
        }

        const deleted = await Banks.destroy({
            where: { _uuid: bank_uuid },
        });

        if (!deleted) return res.status(404).json({ error: "Bank not found" });
        res.status(200).json({ message: "Bank deleted successfully", data: deleted });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete bank" });
    }
};

// ========== fetch bank =======
export const fetchBank = async (req: Request<{}, {}, {}, QueryParams>, res: Response) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";

        const { rows, count } = await Banks.findAndCountAll({
            where: { status: 1 },
            limit,
            offset: skip,
            order: [[orderBy, order]],
            attributes: {
                include: [
                    [fn("CONCAT", literal(`'${url()}/logo/'`), col("logo")), "url"],
                ],
            },
        });

        res.status(200).json({
            data: rows,
            total: count,
            meta: {
                limit,
                skip,
                orderBy,
                order,
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch bank" });
    }
};

// ========== bank option =======
export const getBankOption = async (req: Request, res: Response) => {
    try {
        const bank = await Banks.findAll({
            where: { status: 1 },
            attributes: {
                include: [
                    [fn("CONCAT", literal(`'${url()}/logo/'`), col("logo")), "url"],
                ],
            },
        });
        res.status(200).json({ data: bank });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch bank" });
    }
};
