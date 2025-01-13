const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { unlink } = require('fs');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
const tables = `tbl_income`;
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'image/document'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, 'nc-' + Date.now() + path.extname(file.originalname)); // Unique filename
    },
});
const upload = multer({ storage });
router.post("/create", upload.single('file_incom'), (req, res) => {

    const file_name = req.file ? req.file.filename : null;
    const { incom_uuid, type_incom_fk, acount_id_fk, incom_title, balance_total, tax, balance_incom, description, date_incom, user_byid, feile_check } = req.body;
    const incomeDate = moment(date_incom).format('YYYY-MM-DD');

    const balanceTotal = Math.round(parseFloat(balance_total.replace(/,/g, '')));
    const balanceIncom = Math.round(parseFloat(balance_incom.replace(/,/g, '')));

    if (!incom_uuid) {
        const fields = 'incom_uuid, incom_number, type_incom_fk, acount_id_fk, incom_title, balance_total, tax, balance_incom, description, date_incom, status_confrim, file_incom, status_delete,user_byid,date_register';
        const fieldNumber = `  COALESCE(
        CONCAT('PLC-', RIGHT(YEAR(CURDATE()), 2), '/', LPAD(SUBSTRING(MAX(incom_number), 8) + 1, 3, '00')),
        CONCAT('PLC-', RIGHT(YEAR(CURDATE()), 2), '/001')
    ) AS incom_number`;
        const wheres = `incom_number LIKE CONCAT('PLC-', RIGHT(YEAR(CURDATE()), 2), '/%');`;
        db.queryConditions(tables, fieldNumber, wheres, (err, resp) => {
            const incom_number = resp[0].incom_number;
            const data = [uuidv4(), incom_number, type_incom_fk, acount_id_fk, incom_title, balanceTotal, tax, balanceIncom, description, incomeDate, 1, file_name, 1, user_byid, dateTime];
            db.insertData(tables, fields, data, (err, resp) => {
                if (err) {
                    return res.status(500).json({ error: 'Error creating expenditure' });
                }
                res.status(200).json({ message: 'Expenditure created successfully' });
            });
        });
    } else {
        if (feile_check && file_name) {
            const filePath = path.join('image/document',feile_check);
            fs.unlink(filePath, (err) => {
                if (err) {
                  console.error('Error deleting file:', err);
                }
              });
        }

        const dataedit = [type_incom_fk, acount_id_fk, incom_title, balanceTotal, tax, balanceIncom, description, incomeDate, file_name, user_byid, incom_uuid];
        const fields = `type_incom_fk, acount_id_fk, incom_title, balance_total, tax, balance_incom, description, date_incom, file_incom, user_byid`;
        const condition = 'incom_uuid=?';
        db.updateData(tables, fields, dataedit, condition, (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Error creating expenditure' });
            }
            res.status(200).json({ message: 'Expenditure created successfully' });
        });
    }
});

router.get("/single/:id", function (req, res, next) {
    const incom_uuid = req.params.id;
    const tables = `tbl_income
    INNER JOIN tbl_treasury_acount ON tbl_income.acount_id_fk = tbl_treasury_acount.treasury_id
    INNER JOIN tbl_type_treasury ON tbl_treasury_acount.type_acount_id_fk = tbl_type_treasury.type_treasury_id`;
    const fileds = `tbl_income.*, 
	tbl_treasury_acount.type_acount_id_fk, 
	tbl_type_treasury.typeId_fk`;
    const where = `incom_uuid='${incom_uuid}'`;
    db.fetchSingle(tables, fileds, where, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'ຂໍອະໄພການລືບຂໍ້ມູນບໍ່ສຳເລັດ' });
        }
        res.status(200).json(results);
    });
});


router.post("/read", (req, res) => {
    const { start_date, end_date, type_incom_fk, acount_id_fk } = req.body;

    const startDate = moment(start_date).format('YYYY-MM-DD');
    const endDate = moment(end_date).format('YYYY-MM-DD');

    let type_incom = ``;
    let acountId = ``;
    if (type_incom_fk) {
        type_incom = `AND type_incom_fk='${type_incom_fk}'`;
    }
    if (acount_id_fk) {
        acountId = `AND acount_id_fk='${acount_id_fk}'`;
    }
    const tables = `tbl_income
	INNER JOIN tbl_type_icom_expenses ON tbl_income.type_incom_fk = tbl_type_icom_expenses.type_in_ex_Id
	INNER JOIN tbl_treasury_acount ON tbl_income.acount_id_fk = tbl_treasury_acount.treasury_id
	LEFT JOIN tbl_banks ON tbl_treasury_acount.bank_id_fk = tbl_banks.bankId
    INNER JOIN tbl_type_treasury ON tbl_treasury_acount.type_acount_id_fk = tbl_type_treasury.type_treasury_id
    INNER JOIN tbl_currency ON tbl_type_treasury.currency_id_fk = tbl_currency.currencyId`;
    const fields = `tbl_income.*,
    tbl_type_treasury.currency_id_fk,
	tbl_type_icom_expenses.type_code, 
	tbl_type_icom_expenses.in_ex_name, 
	tbl_treasury_acount.acountName, 
	tbl_treasury_acount.acount_number, 
	tbl_banks.bankName,
    tbl_currency.currency,
    tbl_currency.genus,
    tbl_currency.genus_laos`;
    const wheres = `date_incom BETWEEN '${startDate}' AND '${endDate}' AND status_delete='1' ${type_incom} ${acountId}`;
    db.queryConditions(tables, fields, wheres, (err, resp) => {
        if (err) {
            return res.status(500).json({ error: 'Error reading expenditures' });
        }
        res.status(200).json(resp);
    });
});

module.exports = router;