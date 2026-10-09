import { Request, Response } from "express";
import Company from "../../models/company";
import Province from "../../models/province";
import District from "../../models/district";
import { deleteFile } from "../../utils/uploadFile";
import { actorOf, sendError } from "../bansi/bansiHelpers";
import { COMPANY_FOLDER, companyLogoUrl } from "./hrHelpers";

/**
 * ຂໍ້ມູນບໍລິສັດ (ແຖວດຽວ) — ຊື່ ລາວ/ອັງກິດ, ໂລໂກ້, ເບີໂທ 1/2, ທີ່ຢູ່, ພິກັດ + ໄລຍະສະແກນເຂົ້າ-ອອກວຽກ,
 * ເວລາເຂົ້າ-ອອກວຽກ ແລະ ວັນພັກປະຈຳອາທິດ
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_RADIUS = 10;
const MAX_RADIUS = 1000;

/** ເມືອງ + ແຂວງຂອງເມືອງ (ບໍລິສັດເກັບແຕ່ district_id) */
const includeAddress = [{
  model: District,
  as: "district",
  attributes: ["_uuid", "district_name", "province_id"],
  include: [{ model: Province, as: "province", attributes: ["_uuid", "province_name"] }],
}];

const present = (row: Company | null) => {
  if (!row) return null;
  const r: any = row.get({ plain: true });
  return {
    ...r,
    latitude: r.latitude === null ? null : Number(r.latitude),
    longitude: r.longitude === null ? null : Number(r.longitude),
    days_off: String(r.days_off ?? "").split(",").filter((d) => d !== "").map(Number),
    logo_url: companyLogoUrl(r.logo),
  };
};

const findCompany = () => Company.findOne({ include: includeAddress, order: [["_uuid", "ASC"]] });

/** GET /company — null = ຍັງບໍ່ໄດ້ຕັ້ງ */
export const getCompany = async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ data: present(await findCompany()) });
  } catch (error) {
    sendError(res, error, "Error getting company");
  }
};

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;

/** ພິກັດ — ຫວ່າງ = null, ນອກຂອບເຂດ = NaN */
const coordinate = (value: unknown, limit: number) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e7) / 1e7 : NaN;
};

const parseInput = async (body: any): Promise<Record<string, unknown> | { error: string }> => {
  const name = text(body.name_la, 200);
  if (!name) return { error: "ກະລຸນາປ້ອນຊື່ບໍລິສັດ (ພາສາລາວ)" };

  const districtId = Number(body.district_id) || null;
  if (districtId && !(await District.findByPk(districtId))) return { error: "ບໍ່ພົບເມືອງທີ່ເລືອກ" };

  const latitude = coordinate(body.latitude, 90);
  const longitude = coordinate(body.longitude, 180);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return { error: "ພິກັດບໍ່ຖືກຕ້ອງ" };
  if ((latitude === null) !== (longitude === null)) return { error: "ກະລຸນາປ້ອນພິກັດໃຫ້ຄົບທັງ latitude ແລະ longitude" };

  const radius = Math.round(Number(body.scan_radius));
  if (!Number.isFinite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
    return { error: `ໄລຍະສະແກນຕ້ອງຢູ່ລະຫວ່າງ ${MIN_RADIUS}–${MAX_RADIUS} ແມັດ` };
  }

  const start = String(body.work_start ?? "").trim();
  const end = String(body.work_end ?? "").trim();
  if (!TIME.test(start) || !TIME.test(end)) return { error: "ເວລາເຂົ້າ-ອອກວຽກບໍ່ຖືກຕ້ອງ (HH:mm)" };
  if (end <= start) return { error: "ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ" };

  // ວັນພັກ "6,0" ຫຼື ["6","0"] — 0 ອາທິດ … 6 ເສົາ, ຕ້ອງເຫຼືອວັນເຮັດວຽກຢ່າງໜ້ອຍ 1 ວັນ
  const raw = Array.isArray(body.days_off) ? body.days_off : String(body.days_off ?? "").split(",");
  const days = [...new Set(raw.map((d: unknown) => String(d).trim()).filter((d: string) => d !== ""))].map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { error: "ວັນພັກບໍ່ຖືກຕ້ອງ" };
  if (days.length >= 7) return { error: "ຕ້ອງມີວັນເຮັດວຽກຢ່າງໜ້ອຍ 1 ວັນ" };

  return {
    name_la: name,
    name_en: text(body.name_en, 200),
    phone1: text(body.phone1, 30),
    phone2: text(body.phone2, 30),
    district_id: districtId,
    village: text(body.village, 150),
    latitude,
    longitude,
    scan_radius: radius,
    work_start: start,
    work_end: end,
    days_off: days.join(","),
  };
};

const uploadedLogo = (req: Request) => (req as any).file?.filename as string | undefined;
const discardLogo = (req: Request) => {
  const name = uploadedLogo(req);
  if (name) deleteFile(COMPANY_FOLDER, name);
};

/** PUT /company (multipart) — ສ້າງແຖວທຳອິດ ຫຼື ແກ້ແຖວເດີມ; ໂລໂກ້ໃໝ່ field "logo", remove_logo=1 = ລຶບໂລໂກ້ */
export const saveCompany = async (req: Request, res: Response) => {
  try {
    const input = await parseInput(req.body || {});
    if ("error" in input) {
      discardLogo(req);
      res.status(400).json({ message: input.error });
      return;
    }
    const uploaded = uploadedLogo(req);
    const removeLogo = Number(req.body?.remove_logo) === 1;
    const actor = Number(actorOf(req)) || null;
    const row = await Company.findOne({ order: [["_uuid", "ASC"]] });
    const oldLogo = row && (uploaded || removeLogo) ? row.logo : null;
    if (uploaded || removeLogo) input.logo = uploaded ?? null;

    if (row) await row.update({ ...input, updatedbyid: actor, updatedAt: new Date() });
    else await Company.create({ ...input, updatedbyid: actor });

    if (oldLogo) deleteFile(COMPANY_FOLDER, oldLogo);
    res.status(200).json({ message: "Successfully saved company", data: present(await findCompany()) });
  } catch (error) {
    discardLogo(req);
    sendError(res, error, "Error saving company");
  }
};
