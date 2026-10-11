"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("../config/database"));
const userModel_1 = __importDefault(require("../models/userModel"));
const typeUserModel_1 = __importDefault(require("../models/typeUserModel"));
const autoSync_1 = require("../utils/autoSync");
const utils_1 = require("../utils");
/**
 * ສ້າງຜູ້ໃຊ້ຄົນທຳອິດ (route /user/create ຕ້ອງ login ກ່ອນ ຈຶ່ງໃຊ້ສ້າງຄົນທຳອິດບໍ່ໄດ້)
 * ໃຊ້: npm run create-admin -- <phones> <password> [user_name]
 */
const main = async () => {
    const [phones, password, userName = "admin"] = process.argv.slice(2);
    if (!phones || !password) {
        console.error("ໃຊ້: npm run create-admin -- <phones> <password> [user_name]");
        process.exit(1);
    }
    await database_1.default.authenticate();
    await (0, autoSync_1.runAutoSync)();
    if (await userModel_1.default.findOne({ where: { phones } })) {
        console.error(`❌ ເບີ ${phones} ມີຜູ້ໃຊ້ແລ້ວ`);
        process.exit(1);
    }
    // ລະດັບ 1 "ສູງສຸດ" — ສ້າງໃຫ້ຖ້າຍັງບໍ່ມີ (ຄືກັບ seedDefaults)
    const [typeUser] = await typeUserModel_1.default.findOrCreate({
        where: { _uuid: 1 },
        defaults: { _uuid: 1, names: "ສູງສຸດ", status: 1 },
    });
    const user = await userModel_1.default.create({
        user_uuid: await (0, utils_1.maxid)(userModel_1.default, "user_uuid"),
        type_user: typeUser._uuid,
        user_name: userName,
        phones,
        password: bcryptjs_1.default.hashSync(password, 10),
        status: 1,
        deletes: 1,
        updates: 1,
        creates: 1,
    });
    console.log(`✅ ສ້າງຜູ້ໃຊ້ ${user.user_name} (${user.phones}) user_uuid=${user.user_uuid}`);
    await database_1.default.close();
};
main().catch(async (error) => {
    console.error("❌", error?.parent?.sqlMessage ?? error);
    await database_1.default.close();
    process.exit(1);
});
