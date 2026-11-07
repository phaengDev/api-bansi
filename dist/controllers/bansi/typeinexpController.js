"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTypeInexpOption = exports.deleteTypeInexp = exports.updateTypeInexp = exports.createTypeInexp = exports.getTypeInexp = exports.addSubCategory = void 0;
const sequelize_1 = require("sequelize");
const utils_1 = require("../../utils");
const typeIncomeModel_1 = __importDefault(require("../../models/typeIncomeModel"));
const financeSubCategory_1 = __importDefault(require("../../models/financeSubCategory"));
const incomeModel_1 = __importDefault(require("../../models/incomeModel"));
const expenseModel_1 = __importDefault(require("../../models/expenseModel"));
const MAX_SUBS = 100;
const subOrder = [["sort", "ASC"], ["_uuid", "ASC"]];
/** ລາຍການຍ່ອຍທັງໝົດ (ໜ້າຕັ້ງຄ່າ) / ສະເພາະທີ່ໃຊ້ງານ (ຕົວເລືອກໃນຟອມ) — separate = ບໍ່ໃຫ້ join ເຮັດໃຫ້ນັບແຖວຜິດ */
const subsInclude = (activeOnly) => ({
    model: financeSubCategory_1.default,
    as: "subs",
    attributes: ["_uuid", "category_id", "name", "sort", "status"],
    separate: true,
    order: subOrder,
    ...(activeOnly ? { where: { status: 1 } } : {}),
});
/** body.subs → ລາຍການທີ່ກວດແລ້ວ (ແຖວຫວ່າງຂ້າມ); undefined = ບໍ່ແຕະລາຍການຍ່ອຍ */
const parseSubs = (raw) => {
    if (raw === undefined)
        return undefined;
    let list = raw;
    if (typeof raw === "string") {
        try {
            list = JSON.parse(raw);
        }
        catch {
            return { error: "ລາຍການຍ່ອຍບໍ່ຖືກຕ້ອງ" };
        }
    }
    if (!Array.isArray(list))
        return { error: "ລາຍການຍ່ອຍບໍ່ຖືກຕ້ອງ" };
    const subs = [];
    const seen = new Set();
    for (const item of list) {
        const name = String(item?.name ?? "").trim().slice(0, 150);
        if (!name)
            continue;
        const key = name.toLowerCase();
        if (seen.has(key))
            return { error: `ລາຍການຍ່ອຍ "${name}" ຊ້ຳກັນ` };
        seen.add(key);
        subs.push({ _uuid: Number(item?._uuid) || null, name, status: Number(item?.status ?? 1) === 0 ? 0 : 1 });
    }
    if (subs.length > MAX_SUBS)
        return { error: `ລາຍການຍ່ອຍໄດ້ບໍ່ເກີນ ${MAX_SUBS} ລາຍການຕໍ່ປະເພດ` };
    return subs;
};
/** ບັນທຶກລາຍການຍ່ອຍຕາມລຳດັບທີ່ສົ່ງ — ມີ _uuid = ແກ້, ບໍ່ມີ = ເພີ່ມ, ບໍ່ສົ່ງມາ = ລຶບ (ມີລາຍຮັບ/ລາຍຈ່າຍໃຊ້ຢູ່ = ປິດໃຊ້ງານແທນ) */
const syncSubs = async (categoryId, subs, t) => {
    const existing = await financeSubCategory_1.default.findAll({ where: { category_id: categoryId }, transaction: t });
    const byId = new Map(existing.map((s) => [s._uuid, s]));
    const keep = new Set();
    for (const [sort, item] of subs.entries()) {
        const current = item._uuid ? byId.get(item._uuid) : undefined;
        if (current) {
            keep.add(current._uuid);
            await current.update({ name: item.name, status: item.status, sort, updatedAt: new Date() }, { transaction: t });
        }
        else {
            await financeSubCategory_1.default.create({ category_id: categoryId, name: item.name, status: item.status, sort }, { transaction: t });
        }
    }
    const removed = existing.filter((s) => !keep.has(s._uuid)).map((s) => s._uuid);
    if (!removed.length)
        return;
    const where = { sub_category_id: { [sequelize_1.Op.in]: removed } };
    const [incomes, expenses] = await Promise.all([
        incomeModel_1.default.findAll({ where, attributes: ["sub_category_id"], group: ["sub_category_id"], raw: true, transaction: t }),
        expenseModel_1.default.findAll({ where, attributes: ["sub_category_id"], group: ["sub_category_id"], raw: true, transaction: t }),
    ]);
    const used = new Set([...incomes, ...expenses].map((r) => Number(r.sub_category_id)));
    const unused = removed.filter((id) => !used.has(id));
    // ປິດໃຊ້ງານ ແລ້ວຍ້າຍໄປທ້າຍລາຍການ
    for (const [i, id] of [...used].entries()) {
        await financeSubCategory_1.default.update({ status: 0, sort: subs.length + i, updatedAt: new Date() }, { where: { _uuid: id }, transaction: t });
    }
    if (unused.length)
        await financeSubCategory_1.default.destroy({ where: { _uuid: { [sequelize_1.Op.in]: unused } }, transaction: t });
};
const withSubs = (id) => typeIncomeModel_1.default.findByPk(id, { include: [subsInclude(false)] });
/**
 * POST /finance-category/sub/:id { name } — :id = ປະເພດ; ເພີ່ມລາຍການຍ່ອຍ 1 ອັນທ້າຍລາຍການ (ປຸ່ມ "ເພີ່ມໃໝ່" ໃນຟອມລາຍຮັບ/ລາຍຈ່າຍ).
 * ຊື່ຊ້ຳກັບອັນທີ່ມີແລ້ວ = ຄືນອັນນັ້ນ (existed); ອັນທີ່ປິດໃຊ້ = ເປີດຄືນ
 */
const addSubCategory = async (req, res) => {
    try {
        const name = String(req.body?.name ?? "").trim().slice(0, 150);
        if (!name) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ລາຍການຍ່ອຍ" });
            return;
        }
        const category = await typeIncomeModel_1.default.findOne({ where: { _uuid: Number(atob(req.params.id)), status: 1 } });
        if (!category) {
            res.status(404).json({ message: "ບໍ່ພົບປະເພດ" });
            return;
        }
        const existing = await financeSubCategory_1.default.findAll({ where: { category_id: category._uuid } });
        const nextSort = existing.reduce((n, s) => Math.max(n, Number(s.sort) + 1), 0);
        const same = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
        if (same) {
            const wasOff = Number(same.status) !== 1;
            if (wasOff)
                await same.update({ status: 1, sort: nextSort, updatedAt: new Date() });
            res.status(200).json({ message: wasOff ? "ເປີດໃຊ້ລາຍການຍ່ອຍຄືນແລ້ວ" : "ມີລາຍການຍ່ອຍນີ້ແລ້ວ", existed: !wasOff, data: same });
            return;
        }
        if (existing.length >= MAX_SUBS) {
            res.status(400).json({ message: `ລາຍການຍ່ອຍໄດ້ບໍ່ເກີນ ${MAX_SUBS} ລາຍການຕໍ່ປະເພດ` });
            return;
        }
        const created = await financeSubCategory_1.default.create({ category_id: category._uuid, name, sort: nextSort, status: 1 });
        res.status(200).json({ message: "Successfully added sub-item", data: created });
    }
    catch (error) {
        res.status(500).json({ message: "Error adding sub-item", error });
    }
};
exports.addSubCategory = addSubCategory;
const getTypeInexp = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const typestatus = req.params.id;
        const { rows, count } = await typeIncomeModel_1.default.findAndCountAll({
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
    }
    catch (error) {
        res.status(500).json({ message: "Error getting typeinexp", error });
    }
};
exports.getTypeInexp = getTypeInexp;
// =========create typeinexp — subs? = [{ name, status? }] ລາຍການຍ່ອຍ
const createTypeInexp = async (req, res) => {
    const { subs: rawSubs, ...fields } = req.body || {};
    const subs = parseSubs(rawSubs);
    if (subs && "error" in subs) {
        res.status(400).json({ message: subs.error });
        return;
    }
    const t = await typeIncomeModel_1.default.sequelize.transaction();
    try {
        const newid = await (0, utils_1.maxid)(typeIncomeModel_1.default, '_uuid');
        if (!fields.createdAt) {
            fields.createdAt = new Date();
        }
        fields._uuid = newid;
        const typeinexp = await typeIncomeModel_1.default.create(fields, { transaction: t });
        if (subs)
            await syncSubs(typeinexp._uuid, subs, t);
        await t.commit();
        res.status(200).json({ message: "Successfully creating typeinexp", data: await withSubs(typeinexp._uuid) });
    }
    catch (error) {
        await t.rollback();
        res.status(500).json({ message: "Error creating typeinexp", error });
    }
};
exports.createTypeInexp = createTypeInexp;
// ============ update typeinexp — subs? ສົ່ງມາ = ແທນລາຍການຍ່ອຍທັງໝົດ (ບໍ່ສົ່ງ ເຊັ່ນ ເປີດ/ປິດຈາກບັດ = ບໍ່ແຕະ)
const updateTypeInexp = async (req, res) => {
    const { subs: rawSubs, ...fields } = req.body || {};
    const subs = parseSubs(rawSubs);
    if (subs && "error" in subs) {
        res.status(400).json({ message: subs.error });
        return;
    }
    const t = await typeIncomeModel_1.default.sequelize.transaction();
    try {
        const id = atob(req.params.id);
        const typeinexp = await typeIncomeModel_1.default.findByPk(id, { transaction: t });
        if (!typeinexp) {
            await t.rollback();
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        // ໃຊ້ instance.update — FinanceCategories.update() ບໍ່ມີ where ຈະແກ້ທຸກແຖວ
        await typeinexp.update(fields, { transaction: t });
        if (subs)
            await syncSubs(typeinexp._uuid, subs, t);
        await t.commit();
        res.status(200).json({
            message: "Successfully updating typeinexp",
            data: await withSubs(typeinexp._uuid)
        });
    }
    catch (error) {
        await t.rollback();
        res.status(500).json({ message: "Error updating typeinexp", error });
    }
};
exports.updateTypeInexp = updateTypeInexp;
// ========= delete typeinexp
const deleteTypeInexp = async (req, res) => {
    try {
        const id = atob(req.params.id);
        const typeinexp = await typeIncomeModel_1.default.findByPk(id);
        if (!typeinexp) {
            res.status(404).json({ message: 'TypeInexp not found' });
            return;
        }
        await typeinexp.destroy();
        res.status(200).json({
            message: 'Successfully deleted typeinexp',
        });
    }
    catch (error) {
        console.error('Delete typeinexp error:', error);
        res.status(500).json({
            message: 'Error deleting typeinexp',
            error,
        });
    }
};
exports.deleteTypeInexp = deleteTypeInexp;
// ========== get typeinexp by id
const getTypeInexpOption = async (req, res) => {
    try {
        const typestatus = req.params.id;
        // ລາຍການຍ່ອຍສະເພາະທີ່ໃຊ້ງານ — ຟອມລາຍຮັບ/ລາຍຈ່າຍເລືອກປະເພດແລ້ວເລືອກລາຍການຍ່ອຍ
        const typeinexp = await typeIncomeModel_1.default.findAll({
            where: { typestatus: typestatus, status: 1 },
            include: [subsInclude(true)],
        });
        if (!typeinexp) {
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        res.status(200).json({ message: "Successfully fetching typeinexp", data: typeinexp });
    }
    catch (error) {
        res.status(500).json({ message: "Error fetching typeinexp", error });
    }
};
exports.getTypeInexpOption = getTypeInexpOption;
