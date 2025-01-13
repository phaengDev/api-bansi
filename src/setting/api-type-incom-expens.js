const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post("/create", function (req, res) {
    const { type_in_exId, status_id_fk, in_ex_name, typeCode } = req.body;
    const table = 'tbl_type_icom_expenses';
    const wheres = `status_id_fk='${status_id_fk}'`;
    if (!type_in_exId) {
        const maxCode = `CASE 
            WHEN MAX(CAST(SUBSTRING(type_code, 4) AS UNSIGNED)) IS NULL THEN '${typeCode}-001'
            ELSE CONCAT('${typeCode}-', LPAD(MAX(CAST(SUBSTRING(type_code, 4) AS UNSIGNED)) + 1, 3, '0')) 
            END AS type_code`;
        db.queryConditions(table, maxCode, wheres, (err, ress) => {
            if (err) {
                console.error('Error fetching custom code:', err);
                return res.status(500).json({ error: 'Error generating custom code' });
            }
            const type_code = ress[0].type_code;

            db.autoId(table, 'type_in_ex_Id', (err, type_in_ex_Id) => {
                const fields = 'type_in_ex_Id,type_code, status_id_fk,in_ex_name,status_del';
                const data = [type_in_ex_Id, type_code, status_id_fk, in_ex_name, '1'];
                db.insertData(table, fields, data, (err, results) => {
                    if (err) {
                        console.error('Error inserting data:', err);
                        return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
                    }
                    console.log('Data inserted successfully:', results);
                    res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
                });
            });
        });

    } else {
        const field = 'status_id_fk,in_ex_name';
        const newData = [status_id_fk, in_ex_name, type_in_exId];
        const condition = 'type_in_ex_Id=?';
        db.updateData(table, field, newData, condition, (err, results) => {
            if (err) {
                console.error('Error updating data:', err);
                return res.status(500).json({ error: 'ແກ້ໄຂຂໍ້ມູນບໍ່ສຳເລັດ ກະລຸນາກວອສອນແລ້ວລອງໃໝ່ອິກຄັ້ງ' });
            }
            console.log('Data updated successfully:', results);
            res.status(200).json({ message: 'ການແກ້ໄຂຂໍ້ມູນສຳເລັດ', data: results });
        });
    }
});

router.delete("/:id", function (req, res, next) {
    const type_in_ex_Id = req.params.id;
    const where = `type_in_ex_Id='${type_in_ex_Id}'`;
    db.deleteData('tbl_type_icom_expenses', where, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'ຂໍອະໄພການລືບຂໍ້ມູນບໍ່ສຳເລັດ' });
        }
        res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
    });
});

router.get("/", function (req, res) {
    const tables = `tbl_type_icom_expenses
	INNER JOIN tbl_statuse ON tbl_type_icom_expenses.status_id_fk = tbl_statuse.status_id`;
    const fileds=`tbl_type_icom_expenses.type_in_ex_Id, 
	tbl_type_icom_expenses.type_code, 
	tbl_type_icom_expenses.status_id_fk, 
	tbl_type_icom_expenses.in_ex_name,
	tbl_statuse.statusCode, 
	tbl_statuse.statusName`;
    const wheres=`status_del='1'`;
    db.queryConditions(tables,fileds,wheres, (err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});




router.get("/type/:id", function (req, res) {
    const status_id_fk=req.params.id;
    const tables = `tbl_type_icom_expenses`;
    const fileds=`tbl_type_icom_expenses.type_in_ex_Id, 
	tbl_type_icom_expenses.type_code,  
	tbl_type_icom_expenses.in_ex_name`;
    const wheres=`status_del='1' AND status_id_fk='${status_id_fk}'`;
    db.queryConditions(tables,fileds,wheres, (err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});

module.exports = router;