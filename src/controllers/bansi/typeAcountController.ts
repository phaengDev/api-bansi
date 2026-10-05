import { Request, Response } from "express";
import { maxid } from "../../utils";
import TypeAccount from "../../models/typeAcount";
interface QueryParams {
  limit?: string;
  skip?: string;
  orderBy?: string;
  order?: string;
}
// create typeAcount
export const createTypeAcount = async (req: Request, res: Response) => {
  try {
    if (!req.body.createdAt) {
      req.body.createdAt = new Date();
    }
    const newid = await maxid(TypeAccount, "_uuid");
    req.body._uuid = newid;
    const typeAcount = await TypeAccount.create(req.body);
    res.status(200).json({ message: "Successfully creating typeAcount", typeAcount });
  } catch (error) {
    res.status(500).json({ message: "Error creating typeAcount", error });
  }
};

// updated typeAcount
export const updateTypeAcount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.body.createdAt) {
      req.body.createdAt = new Date();
    }
    const _uuid = atob(req.params.id);
    const typeAcount = await TypeAccount.update(req.body, {
      where: { _uuid: _uuid },
    });
    res.status(200).json({ message: "Successfully updating typeAcount", data: typeAcount });
  } catch (error) {
    res.status(500).json({ message: "Error updating typeAcount", error });
  }
};

// delete typeAcount
export const deleteTypeAcount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const _uuid = atob(req.params.id);
    const typeAcount = await TypeAccount.destroy({
      where: { _uuid: _uuid },
    });
    res.status(200).json({ message: "Successfully deleting typeAcount", data: typeAcount });
  } catch (error) {
    res.status(500).json({ message: "Error deleting typeAcount", error });
  }
};

// get typeAcount
export const getTypeAcount = async (
  req: Request<{}, {}, {}, QueryParams>,
  res: Response
): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
    const orderBy = req.query.orderBy || "_uuid";
    const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
    const { rows, count } = await TypeAccount.findAndCountAll({
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
    res.status(500).json({ message: "Error getting typeAcount", error });
  }
};
// get option
export const getTypeAcountOption = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const typeAcount = await TypeAccount.findAll({
      where: { status: 1 }
    });
    res.json({
      data: typeAcount
    });
  } catch (error) {
    console.error("Error in getTypeAcount:", error);
    res.status(500).json({ message: "Error fetching typeAcount", error });
  }
};