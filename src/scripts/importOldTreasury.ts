import fs from "fs";
import path from "path";
import sequelize from "../config/database";
import Banks from "../models/bankModel";
import Currency from "../models/currencyModel";
import TypeAcount from "../models/typeAcount";
import TypeTreasury from "../models/typeTreasury";
import TreasuryAccount from "../models/treasuryAcount";
import { runAutoSync } from "../utils/autoSync";
import { KIND_HELD, KIND_USABLE, MOVE_IN, MOVE_OUT, moveBalance } from "../controllers/bansi/accountMovement";
import { postAccountOpening } from "../controllers/bansi/glPosting";
import { todayLao } from "../controllers/bansi/journalHelpers";

/**
 * ນຳບັນຊີເງິນຄັງຈາກລະບົບເກົ່າ (backup/bansi_old_*.sql) ເຂົ້າຕາຕະລາງໃໝ່ — ແລ່ນເທື່ອດຽວ:
 *   tbl_banks (ເກົ່າ) → tbl_banks, tbl_type_acount → tbl_type_account, tbl_type_treasury → tbl_type_treasury,
 *   tbl_treasury_acount → tbl_treasury_account. ໃຊ້ id ເດີມ (ການອ້າງອີງລະຫວ່າງຕາຕະລາງຄືເກົ່າ), ສະກຸນເງິນຈັບຄູ່ດ້ວຍຊື່.
 * ຍອດເງິນ: ສ້າງບັນຊີດ້ວຍ 0 ແລ້ວໃສ່ຍອດຜ່ານ moveBalance (ປະຫວັດ OPENING) + postAccountOpening (ບັນຊີຄູ່)
 * ຄືກັບການເປີດບັນຊີໃໝ່. ສະກຸນທີ່ຍັງບໍ່ມີອັດຕາແລກປ່ຽນ → ຂ້າມການລົງບັນຊີຄູ່ (ຕັ້ງອັດຕາແລ້ວກົດ ລົງບັນຊີຍ້ອນຫຼັງ / POST /gl/rebuild)
 * ໃຊ້: npx ts-node src/scripts/importOldTreasury.ts [ໄຟລ໌ backup]
 */

type Row = Record<string, string | null>;

/** ຄ່າໃນ VALUES (...) ຂອງ INSERT ທີ່ backup ຂຽນ (mysql2 escape): 'ຂໍ້ຄວາມ', ຕົວເລກ, NULL */
const parseValues = (text: string) => {
  const values: (string | null)[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      let s = "";
      i++;
      while (text[i] !== "'") {
        if (text[i] === "\\") {
          i++;
          s += ({ n: "\n", r: "\r", t: "\t", "0": "\0" } as Record<string, string>)[text[i]] ?? text[i];
        } else s += text[i];
        i++;
      }
      i++;
      values.push(s);
    } else if (ch === "," || ch === " ") {
      i++;
    } else {
      let s = "";
      while (i < text.length && text[i] !== ",") s += text[i++];
      values.push(s.trim() === "NULL" ? null : s.trim());
    }
  }
  return values;
};

const readOldRows = (sql: string, table: string): Row[] =>
  sql
    .split("\n")
    .filter((line) => line.startsWith(`INSERT INTO \`${table}\` `))
    .map((line) => {
      const match = line.match(/^INSERT INTO `[^`]+` \((.*?)\) VALUES \((.*)\);$/);
      if (!match) throw new Error(`ອ່ານແຖວບໍ່ໄດ້: ${line.slice(0, 80)}`);
      const columns = match[1].split(",").map((c) => c.trim().replace(/`/g, ""));
      const values = parseValues(match[2]);
      return Object.fromEntries(columns.map((c, i) => [c, values[i] ?? null]));
    });

const main = async () => {
  const file = path.resolve(process.argv[2] ?? path.join(__dirname, "../../backup/bansi_old_2026-10-03.sql"));
  const sql = fs.readFileSync(file, "utf8");
  const old = {
    banks: readOldRows(sql, "tbl_banks"),
    currency: readOldRows(sql, "tbl_currency"),
    typeAcount: readOldRows(sql, "tbl_type_acount"),
    typeTreasury: readOldRows(sql, "tbl_type_treasury"),
    treasury: readOldRows(sql, "tbl_treasury_acount"),
  };

  await sequelize.authenticate();
  await runAutoSync();

  // ກັນແລ່ນຊ້ຳ: id ເກົ່າມີຢູ່ແລ້ວ = ຢຸດ (ບໍ່ທັບຂໍ້ມູນ)
  const taken = [
    ...(await Banks.findAll({ where: { _uuid: old.banks.map((b) => Number(b.bankId)) } })),
    ...(await TypeAcount.findAll({ where: { _uuid: old.typeAcount.map((r) => Number(r.type_acount_id)) } })),
    ...(await TypeTreasury.findAll({ where: { _uuid: old.typeTreasury.map((r) => Number(r.type_treasury_id)) } })),
    ...(await TreasuryAccount.findAll({ where: { _uuid: old.treasury.map((r) => Number(r.treasury_id)) } })),
  ];
  if (taken.length) throw new Error(`ມີຂໍ້ມູນ id ເກົ່າຢູ່ແລ້ວ ${taken.length} ແຖວ — ຢຸດ ບໍ່ນຳເຂົ້າຊ້ຳ`);

  // ສະກຸນເງິນເກົ່າ (currencyId) → ສະກຸນໃໝ່ (_id) ຕາມຊື່ ເຊັ່ນ 22001 LAK → 1
  const currencies: any[] = await Currency.findAll({ raw: true });
  const currencyOf = (oldId: string | null) => {
    const name = old.currency.find((c) => c.currencyId === oldId)?.currency;
    const found = currencies.find((c) => c.name === name);
    if (!found) throw new Error(`ບໍ່ພົບສະກຸນເງິນ ${name ?? oldId} ໃນ tbl_currency`);
    return found._id as number;
  };

  const date = todayLao();
  const now = new Date();
  const t = await sequelize.transaction();
  try {
    for (const b of old.banks) {
      await Banks.create({
        _uuid: Number(b.bankId), abbr: b.codeBank ?? "", logo: b.logoBank ?? "", name_la: b.bankName ?? "", name_en: "",
        status: 1, createdAt: now, updatedAt: now,
      }, { transaction: t });
    }
    for (const r of old.typeAcount) {
      await TypeAcount.create({
        _uuid: Number(r.type_acount_id), type_code: r.type_code, type_name: r.type_name, status: 1, createdAt: now, updatedAt: now,
      } as any, { transaction: t });
    }
    for (const r of old.typeTreasury) {
      await TypeTreasury.create({
        _uuid: Number(r.type_treasury_id), typeId: Number(r.typeId_fk), currencyId: currencyOf(r.currency_id_fk),
        treasury_code: r.treasury_code, treasury_name: r.acount_name, status: r.status_del === "1" ? 1 : 0, createdAt: now, updatedAt: now,
      } as any, { transaction: t });
    }
    for (const r of old.treasury) {
      const account = await TreasuryAccount.create({
        _uuid: Number(r.treasury_id), type_treasuryid: Number(r.type_acount_id_fk), bankId: r.bank_id_fk ? Number(r.bank_id_fk) : null,
        acountName: r.acountName, acount_number: r.acount_number, balance_treasury: 0, balance_unable: 0,
        status: r.status_use === "1" ? 1 : 0, createdAt: now, updatedAt: now,
      } as any, { transaction: t });
      for (const [kind, value] of [[KIND_USABLE, Number(r.balance_treasury) || 0], [KIND_HELD, Number(r.balance_unable) || 0]] as const) {
        if (!value) continue;
        await moveBalance(account, {
          direction: value > 0 ? MOVE_IN : MOVE_OUT, amount: value, kind, source: "OPENING", date,
          description: "ຍອດຍົກມາຈາກລະບົບເກົ່າ",
        }, t);
      }
    }
    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }
  console.log(`✅ ທະນາຄານ ${old.banks.length}, ໝວດບັນຊີ ${old.typeAcount.length}, ປະເພດບັນຊີ ${old.typeTreasury.length}, ບັນຊີເງິນຄັງ ${old.treasury.length}`);

  // ບັນຊີຄູ່ຂອງຍອດເລີ່ມຕົ້ນ — ແຍກ transaction ຕໍ່ບັນຊີ: ບັນຊີທີ່ລົງບໍ່ໄດ້ (ເຊັ່ນ ຍັງບໍ່ມີອັດຕາແລກປ່ຽນ) ບໍ່ກະທົບບັນຊີອື່ນ
  for (const r of old.treasury) {
    const total = (Number(r.balance_treasury) || 0) + (Number(r.balance_unable) || 0);
    if (!total) continue;
    const gt = await sequelize.transaction();
    try {
      await postAccountOpening(Number(r.treasury_id), total, date, gt, null);
      await gt.commit();
      console.log(`📒 ${r.acountName}: ລົງບັນຊີຍອດເລີ່ມຕົ້ນ ${total.toLocaleString()}`);
    } catch (error) {
      await gt.rollback();
      console.warn(`⚠️  ${r.acountName}: ລົງບັນຊີຄູ່ບໍ່ໄດ້ — ${(error as Error).message}`);
    }
  }
  await sequelize.close();
};

main().catch(async (error) => {
  console.error("❌", (error as any)?.parent?.sqlMessage ?? (error as Error)?.message ?? error);
  await sequelize.close();
  process.exit(1);
});
