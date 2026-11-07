import { Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import { maxid } from "../../utils";
import FinanceCategories from "../../models/typeIncomeModel";
import FinanceSubCategory from "../../models/financeSubCategory";
import Incomes from "../../models/incomeModel";
import Expenses from "../../models/expenseModel";

const MAX_SUBS = 100;
const subOrder: any = [["sort", "ASC"], ["_uuid", "ASC"]];
/** ລາຍການຍ່ອຍທັງໝົດ (ໜ້າຕັ້ງຄ່າ) / ສະເພາະທີ່ໃຊ້ງານ (ຕົວເລືອກໃນຟອມ) — separate = ບໍ່ໃຫ້ join ເຮັດໃຫ້ນັບແຖວຜິດ */
const subsInclude = (activeOnly: boolean): any => ({
    model: FinanceSubCategory,
    as: "subs",
    attributes: ["_uuid", "category_id", "name", "sort", "status"],
    separate: true,
    order: subOrder,
    ...(activeOnly ? { where: { status: 1 } } : {}),
});

type SubInput = { _uuid: number | null; name: string; status: number };

/** body.subs → ລາຍການທີ່ກວດແລ້ວ (ແຖວຫວ່າງຂ້າມ); undefined = ບໍ່ແຕະລາຍການຍ່ອຍ */
const parseSubs = (raw: unknown): SubInput[] | { error: string } | undefined => {
    if (raw === undefined) return undefined;
    let list: unknown = raw;
    if (typeof raw === "string") {
        try {
            list = JSON.parse(raw);
        } catch {
            return { error: "ລາຍການຍ່ອຍບໍ່ຖືກຕ້ອງ" };
        }
    }
    if (!Array.isArray(list)) return { error: "ລາຍການຍ່ອຍບໍ່ຖືກຕ້ອງ" };
    const subs: SubInput[] = [];
    const seen = new Set<string>();
    for (const item of list as any[]) {
        const name = String(item?.name ?? "").trim().slice(0, 150);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) return { error: `ລາຍການຍ່ອຍ "${name}" ຊ້ຳກັນ` };
        seen.add(key);
        subs.push({ _uuid: Number(item?._uuid) || null, name, status: Number(item?.status ?? 1) === 0 ? 0 : 1 });
    }
    if (subs.length > MAX_SUBS) return { error: `ລາຍການຍ່ອຍໄດ້ບໍ່ເກີນ ${MAX_SUBS} ລາຍການຕໍ່ປະເພດ` };
    return subs;
};

/** ບັນທຶກລາຍການຍ່ອຍຕາມລຳດັບທີ່ສົ່ງ — ມີ _uuid = ແກ້, ບໍ່ມີ = ເພີ່ມ, ບໍ່ສົ່ງມາ = ລຶບ (ມີລາຍຮັບ/ລາຍຈ່າຍໃຊ້ຢູ່ = ປິດໃຊ້ງານແທນ) */
const syncSubs = async (categoryId: number, subs: SubInput[], t: Transaction) => {
    const existing = await FinanceSubCategory.findAll({ where: { category_id: categoryId }, transaction: t });
    const byId = new Map(existing.map((s) => [s._uuid, s]));
    const keep = new Set<number>();
    for (const [sort, item] of subs.entries()) {
        const current = item._uuid ? byId.get(item._uuid) : undefined;
        if (current) {
            keep.add(current._uuid);
            await current.update({ name: item.name, status: item.status, sort, updatedAt: new Date() }, { transaction: t });
        } else {
            await FinanceSubCategory.create({ category_id: categoryId, name: item.name, status: item.status, sort }, { transaction: t });
        }
    }
    const removed = existing.filter((s) => !keep.has(s._uuid)).map((s) => s._uuid);
    if (!removed.length) return;
    const where = { sub_category_id: { [Op.in]: removed } };
    const [incomes, expenses] = await Promise.all([
        Incomes.findAll({ where, attributes: ["sub_category_id"], group: ["sub_category_id"], raw: true, transaction: t }),
        Expenses.findAll({ where, attributes: ["sub_category_id"], group: ["sub_category_id"], raw: true, transaction: t }),
    ]);
    const used = new Set([...incomes, ...expenses].map((r: any) => Number(r.sub_category_id)));
    const unused = removed.filter((id) => !used.has(id));
    // ປິດໃຊ້ງານ ແລ້ວຍ້າຍໄປທ້າຍລາຍການ
    for (const [i, id] of [...used].entries()) {
        await FinanceSubCategory.update({ status: 0, sort: subs.length + i, updatedAt: new Date() } as any, { where: { _uuid: id }, transaction: t });
    }
    if (unused.length) await FinanceSubCategory.destroy({ where: { _uuid: { [Op.in]: unused } }, transaction: t });
};

const withSubs = (id: number) => FinanceCategories.findByPk(id, { include: [subsInclude(false)] });

/**
 * POST /finance-category/sub/:id { name } — :id = ປະເພດ; ເພີ່ມລາຍການຍ່ອຍ 1 ອັນທ້າຍລາຍການ (ປຸ່ມ "ເພີ່ມໃໝ່" ໃນຟອມລາຍຮັບ/ລາຍຈ່າຍ).
 * ຊື່ຊ້ຳກັບອັນທີ່ມີແລ້ວ = ຄືນອັນນັ້ນ (existed); ອັນທີ່ປິດໃຊ້ = ເປີດຄືນ
 */
export const addSubCategory = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const name = String(req.body?.name ?? "").trim().slice(0, 150);
        if (!name) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ລາຍການຍ່ອຍ" });
            return;
        }
        const category = await FinanceCategories.findOne({ where: { _uuid: Number(atob(req.params.id)), status: 1 } });
        if (!category) {
            res.status(404).json({ message: "ບໍ່ພົບປະເພດ" });
            return;
        }
        const existing = await FinanceSubCategory.findAll({ where: { category_id: category._uuid } });
        const nextSort = existing.reduce((n, s) => Math.max(n, Number(s.sort) + 1), 0);
        const same = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
        if (same) {
            const wasOff = Number(same.status) !== 1;
            if (wasOff) await same.update({ status: 1, sort: nextSort, updatedAt: new Date() });
            res.status(200).json({ message: wasOff ? "ເປີດໃຊ້ລາຍການຍ່ອຍຄືນແລ້ວ" : "ມີລາຍການຍ່ອຍນີ້ແລ້ວ", existed: !wasOff, data: same });
            return;
        }
        if (existing.length >= MAX_SUBS) {
            res.status(400).json({ message: `ລາຍການຍ່ອຍໄດ້ບໍ່ເກີນ ${MAX_SUBS} ລາຍການຕໍ່ປະເພດ` });
            return;
        }
        const created = await FinanceSubCategory.create({ category_id: category._uuid, name, sort: nextSort, status: 1 });
        res.status(200).json({ message: "Successfully added sub-item", data: created });
    } catch (error) {
        res.status(500).json({ message: "Error adding sub-item", error });
    }
};
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
            include: [subsInclude(false)],
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

// =========create typeinexp — subs? = [{ name, status? }] ລາຍການຍ່ອຍ
export const createTypeInexp = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { subs: rawSubs, ...fields } = req.body || {};
    const subs = parseSubs(rawSubs);
    if (subs && "error" in subs) {
        res.status(400).json({ message: subs.error });
        return;
    }
    const t = await FinanceCategories.sequelize!.transaction();
    try {
        const newid = await maxid(FinanceCategories, '_uuid')
        if (!fields.createdAt) {
            fields.createdAt =new Date();
        }
        fields._uuid = newid
        const typeinexp = await FinanceCategories.create(fields, { transaction: t });
        if (subs) await syncSubs(typeinexp._uuid, subs, t);
        await t.commit();
        res.status(200).json({ message: "Successfully creating typeinexp", data: await withSubs(typeinexp._uuid) });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ message: "Error creating typeinexp", error });
    }
};
// ============ update typeinexp — subs? ສົ່ງມາ = ແທນລາຍການຍ່ອຍທັງໝົດ (ບໍ່ສົ່ງ ເຊັ່ນ ເປີດ/ປິດຈາກບັດ = ບໍ່ແຕະ)
export const updateTypeInexp = async (req: Request<{ id: string }>, res: Response) => {
    const { subs: rawSubs, ...fields } = req.body || {};
    const subs = parseSubs(rawSubs);
    if (subs && "error" in subs) {
        res.status(400).json({ message: subs.error });
        return;
    }
    const t = await FinanceCategories.sequelize!.transaction();
    try {
        const id = atob(req.params.id);
        const typeinexp = await FinanceCategories.findByPk(id, { transaction: t });
        if (!typeinexp) {
            await t.rollback();
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        // ໃຊ້ instance.update — FinanceCategories.update() ບໍ່ມີ where ຈະແກ້ທຸກແຖວ
        await typeinexp.update(fields, { transaction: t });
        if (subs) await syncSubs(typeinexp._uuid, subs, t);
        await t.commit();
        res.status(200).json({ 
            message: "Successfully updating typeinexp", 
            data: await withSubs(typeinexp._uuid)
        });
    } catch (error) {
        await t.rollback();
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
        // ລາຍການຍ່ອຍສະເພາະທີ່ໃຊ້ງານ — ຟອມລາຍຮັບ/ລາຍຈ່າຍເລືອກປະເພດແລ້ວເລືອກລາຍການຍ່ອຍ
        const typeinexp = await FinanceCategories.findAll({
            where: { typestatus: typestatus, status: 1 },
            include: [subsInclude(true)],
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