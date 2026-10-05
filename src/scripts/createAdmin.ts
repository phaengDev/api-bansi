import bcrypt from "bcryptjs";
import sequelize from "../config/database";
import Users from "../models/userModel";
import TypeUser from "../models/typeUserModel";
import { runAutoSync } from "../utils/autoSync";
import { maxid } from "../utils";

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

  await sequelize.authenticate();
  await runAutoSync();

  if (await Users.findOne({ where: { phones } })) {
    console.error(`❌ ເບີ ${phones} ມີຜູ້ໃຊ້ແລ້ວ`);
    process.exit(1);
  }

  // ປະເພດຜູ້ໃຊ້ "Admin" — ສ້າງໃຫ້ຖ້າຍັງບໍ່ມີ
  const [typeUser] = await TypeUser.findOrCreate({
    where: { names: "Admin" },
    defaults: { names: "Admin", status: 1 },
  });

  const user = await Users.create({
    user_uuid: await maxid(Users, "user_uuid"),
    type_user: typeUser._uuid,
    user_name: userName,
    phones,
    password: bcrypt.hashSync(password, 10),
    status: 1,
    deletes: 1,
    updates: 1,
    creates: 1,
  });
  console.log(`✅ ສ້າງຜູ້ໃຊ້ ${user.user_name} (${user.phones}) user_uuid=${user.user_uuid}`);
  await sequelize.close();
};

main().catch(async (error) => {
  console.error("❌", (error as any)?.parent?.sqlMessage ?? error);
  await sequelize.close();
  process.exit(1);
});
