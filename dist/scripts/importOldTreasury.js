"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../config/database"));
const bankModel_1 = __importDefault(require("../models/bankModel"));
const currencyModel_1 = __importDefault(require("../models/currencyModel"));
const typeAcount_1 = __importDefault(require("../models/typeAcount"));
const typeTreasury_1 = __importDefault(require("../models/typeTreasury"));
const treasuryAcount_1 = __importDefault(require("../models/treasuryAcount"));
const autoSync_1 = require("../utils/autoSync");
const accountMovement_1 = require("../controllers/bansi/accountMovement");
const glPosting_1 = require("../controllers/bansi/glPosting");
const journalHelpers_1 = require("../controllers/bansi/journalHelpers");
/** ຄ່າໃນ VALUES (...) ຂອງ INSERT ທີ່ backup ຂຽນ (mysql2 escape): 'ຂໍ້ຄວາມ', ຕົວເລກ, NULL */
const parseValues = (text) => {
    const values = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === "'") {
            let s = "";
            i++;
            while (text[i] !== "'") {
                if (text[i] === "\\") {
                    i++;
                    s += { n: "\n", r: "\r", t: "\t", "0": "\0" }[text[i]] ?? text[i];
                }
                else
                    s += text[i];
                i++;
            }
            i++;
            values.push(s);
        }
        else if (ch === "," || ch === " ") {
            i++;
        }
        else {
            let s = "";
            while (i < text.length && text[i] !== ",")
                s += text[i++];
            values.push(s.trim() === "NULL" ? null : s.trim());
        }
    }
    return values;
};
const readOldRows = (sql, table) => sql
    .split("\n")
    .filter((line) => line.startsWith(`INSERT INTO \`${table}\` `))
    .map((line) => {
    const match = line.match(/^INSERT INTO `[^`]+` \((.*?)\) VALUES \((.*)\);$/);
    if (!match)
        throw new Error(`ອ່ານແຖວບໍ່ໄດ້: ${line.slice(0, 80)}`);
    const columns = match[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    const values = parseValues(match[2]);
    return Object.fromEntries(columns.map((c, i) => [c, values[i] ?? null]));
});
const main = async () => {
    const file = path_1.default.resolve(process.argv[2] ?? path_1.default.join(__dirname, "../../backup/bansi_old_2026-10-03.sql"));
    const sql = fs_1.default.readFileSync(file, "utf8");
    const old = {
        banks: readOldRows(sql, "tbl_banks"),
        currency: readOldRows(sql, "tbl_currency"),
        typeAcount: readOldRows(sql, "tbl_type_acount"),
        typeTreasury: readOldRows(sql, "tbl_type_treasury"),
        treasury: readOldRows(sql, "tbl_treasury_acount"),
    };
    await database_1.default.authenticate();
    await (0, autoSync_1.runAutoSync)();
    // ກັນແລ່ນຊ້ຳ: id ເກົ່າມີຢູ່ແລ້ວ = ຢຸດ (ບໍ່ທັບຂໍ້ມູນ)
    const taken = [
        ...(await bankModel_1.default.findAll({ where: { _uuid: old.banks.map((b) => Number(b.bankId)) } })),
        ...(await typeAcount_1.default.findAll({ where: { _uuid: old.typeAcount.map((r) => Number(r.type_acount_id)) } })),
        ...(await typeTreasury_1.default.findAll({ where: { _uuid: old.typeTreasury.map((r) => Number(r.type_treasury_id)) } })),
        ...(await treasuryAcount_1.default.findAll({ where: { _uuid: old.treasury.map((r) => Number(r.treasury_id)) } })),
    ];
    if (taken.length)
        throw new Error(`ມີຂໍ້ມູນ id ເກົ່າຢູ່ແລ້ວ ${taken.length} ແຖວ — ຢຸດ ບໍ່ນຳເຂົ້າຊ້ຳ`);
    // ສະກຸນເງິນເກົ່າ (currencyId) → ສະກຸນໃໝ່ (_id) ຕາມຊື່ ເຊັ່ນ 22001 LAK → 1
    const currencies = await currencyModel_1.default.findAll({ raw: true });
    const currencyOf = (oldId) => {
        const name = old.currency.find((c) => c.currencyId === oldId)?.currency;
        const found = currencies.find((c) => c.name === name);
        if (!found)
            throw new Error(`ບໍ່ພົບສະກຸນເງິນ ${name ?? oldId} ໃນ tbl_currency`);
        return found._id;
    };
    const date = (0, journalHelpers_1.todayLao)();
    const now = new Date();
    const t = await database_1.default.transaction();
    try {
        for (const b of old.banks) {
            await bankModel_1.default.create({
                _uuid: Number(b.bankId), abbr: b.codeBank ?? "", logo: b.logoBank ?? "", name_la: b.bankName ?? "", name_en: "",
                status: 1, createdAt: now, updatedAt: now,
            }, { transaction: t });
        }
        for (const r of old.typeAcount) {
            await typeAcount_1.default.create({
                _uuid: Number(r.type_acount_id), type_code: r.type_code, type_name: r.type_name, status: 1, createdAt: now, updatedAt: now,
            }, { transaction: t });
        }
        for (const r of old.typeTreasury) {
            await typeTreasury_1.default.create({
                _uuid: Number(r.type_treasury_id), typeId: Number(r.typeId_fk), currencyId: currencyOf(r.currency_id_fk),
                treasury_code: r.treasury_code, treasury_name: r.acount_name, status: r.status_del === "1" ? 1 : 0, createdAt: now, updatedAt: now,
            }, { transaction: t });
        }
        for (const r of old.treasury) {
            const account = await treasuryAcount_1.default.create({
                _uuid: Number(r.treasury_id), type_treasuryid: Number(r.type_acount_id_fk), bankId: r.bank_id_fk ? Number(r.bank_id_fk) : null,
                acountName: r.acountName, acount_number: r.acount_number, balance_treasury: 0, balance_unable: 0,
                status: r.status_use === "1" ? 1 : 0, createdAt: now, updatedAt: now,
            }, { transaction: t });
            for (const [kind, value] of [[accountMovement_1.KIND_USABLE, Number(r.balance_treasury) || 0], [accountMovement_1.KIND_HELD, Number(r.balance_unable) || 0]]) {
                if (!value)
                    continue;
                await (0, accountMovement_1.moveBalance)(account, {
                    direction: value > 0 ? accountMovement_1.MOVE_IN : accountMovement_1.MOVE_OUT, amount: value, kind, source: "OPENING", date,
                    description: "ຍອດຍົກມາຈາກລະບົບເກົ່າ",
                }, t);
            }
        }
        await t.commit();
    }
    catch (error) {
        await t.rollback();
        throw error;
    }
    console.log(`✅ ທະນາຄານ ${old.banks.length}, ໝວດບັນຊີ ${old.typeAcount.length}, ປະເພດບັນຊີ ${old.typeTreasury.length}, ບັນຊີເງິນຄັງ ${old.treasury.length}`);
    // ບັນຊີຄູ່ຂອງຍອດເລີ່ມຕົ້ນ — ແຍກ transaction ຕໍ່ບັນຊີ: ບັນຊີທີ່ລົງບໍ່ໄດ້ (ເຊັ່ນ ຍັງບໍ່ມີອັດຕາແລກປ່ຽນ) ບໍ່ກະທົບບັນຊີອື່ນ
    for (const r of old.treasury) {
        const total = (Number(r.balance_treasury) || 0) + (Number(r.balance_unable) || 0);
        if (!total)
            continue;
        const gt = await database_1.default.transaction();
        try {
            await (0, glPosting_1.postAccountOpening)(Number(r.treasury_id), total, date, gt, null);
            await gt.commit();
            console.log(`📒 ${r.acountName}: ລົງບັນຊີຍອດເລີ່ມຕົ້ນ ${total.toLocaleString()}`);
        }
        catch (error) {
            await gt.rollback();
            console.warn(`⚠️  ${r.acountName}: ລົງບັນຊີຄູ່ບໍ່ໄດ້ — ${error.message}`);
        }
    }
    await database_1.default.close();
};
main().catch(async (error) => {
    console.error("❌", error?.parent?.sqlMessage ?? error?.message ?? error);
    await database_1.default.close();
    process.exit(1);
});
