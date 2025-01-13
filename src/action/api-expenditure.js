const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
const tables = `tbl_expenditure`;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'image/document'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    },
});
const upload = multer({ storage });
router.post("/create", upload.single('file_doc'), (req, res) => {
    const expenditure_id = uuidv4();
    const file_name = req.file ? req.file.filename : null;
    const { expenditure_name, type_expenditure_fk, treasury_id_fk, balance_total, balance_discount, balance_tax, balance_pays, expenditure_date, description, user_create,status_pays } = req.body;
    const detailPays = JSON.parse(req.body.detailPays);
    const expenditureDate = moment(expenditure_date).format('YYYY-MM-DD');

   let date_pays=null;
    if(status_pays==='1'){
        date_pays=moment().format('YYYY-MM-DD HH:mm:ss');
    }else{
        date_pays=null;
    }

    const balanceTotal = Math.round(parseFloat(balance_total.replace(/,/g, '')));
    const balanceDiscount = Math.round(parseFloat(balance_discount.replace(/,/g, '')));
    const balanceTax = Math.round(parseFloat(balance_tax.replace(/,/g, '')));
    const balancePays = Math.round(parseFloat(balance_pays.replace(/,/g, '')));
    const fields = `COALESCE(
        CONCAT('PLC-', RIGHT(YEAR(CURDATE()), 2), '/', LPAD(SUBSTRING(MAX(expenditure_no), 8) + 1, 3, '00')),
        CONCAT('PLC-', RIGHT(YEAR(CURDATE()), 2), '/001')
    ) AS expenditure_no`;
    const wheres = `expenditure_no LIKE CONCAT('PLC-', RIGHT(YEAR(CURDATE()), 2), '/%')`;
    db.queryConditions(tables, fields, wheres, (err, resp) => {
        const expenditure_no = resp[0].expenditure_no;
        const fields = 'expenditure_id,expenditure_no,expenditure_name, type_expenditure_fk, treasury_id_fk,balance_total,balance_discount,balance_tax, balance_pays, expenditure_date, description,file_doc, user_create,date_create,status_confirm,statsus_del,status_pays,date_pays';
        const data = [expenditure_id, expenditure_no, expenditure_name, type_expenditure_fk, treasury_id_fk, balanceTotal, balanceDiscount, balanceTax, balancePays, expenditureDate, description, file_name, user_create, dateTime, '1', '1',status_pays,date_pays];
        db.insertData(tables, fields, data, (err, results) => {
            if (err) {
                // console.error('Error inserting data:', err);
                return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
            }

            const fileInsertPromises = detailPays.map((item, index) => {
                return new Promise((resolve, reject) => {
                    const fieldList = 'cost_list_id,cost_title_fk,list_name,quantity,prices,discount,tax,balane_total';
                    const cost_list_id = uuidv4();
                    const dataList = [
                        cost_list_id,
                        expenditure_id,  // Ensure valid or fallback data
                        item.item || '',
                        item.quantity || 0,
                        item.price || 0,
                        item.discount || 0,
                        item.tax || 0,
                        item.total || 0
                    ];
                    db.insertData('tbl_expenditure_list', fieldList, dataList, (err, results) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(results);
                    });
                });
            });
            Promise.all(fileInsertPromises)
                .then(results => {
                    console.log('All files inserted successfully:', results);
                    res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ' });
                })
                .catch(err => {
                    console.error('Error inserting file data:', err);
                    res.status(500).json({ error: 'Error inserting file data' });
                });
        });
    });
});


router.post('/fetch', function (req, res) {

    const { start_date, end_date, type_expenditure_fk, treasury_id_fk, status_confirm } = req.body;
    const startDates = moment(start_date).format('YYYY-MM-DD');
    const endDates = moment(end_date).format('YYYY-MM-DD');

    const type_expenditure = `${type_expenditure_fk ? ' AND type_expenditure_fk = ' + type_expenditure_fk : ''}`;
    const treasuryId_fk = `${treasury_id_fk ? ' AND treasury_id_fk = ' + treasury_id_fk : ''}`;
    const statusConfirm = `${status_confirm ? ' AND status_confirm = ' + status_confirm : ''}`;
    
    const table = `tbl_expenditure
    LEFT JOIN tbl_treasury_acount ON tbl_expenditure.treasury_id_fk = tbl_treasury_acount.treasury_id
    LEFT JOIN tbl_type_icom_expenses ON tbl_expenditure.type_expenditure_fk = tbl_type_icom_expenses.type_in_ex_Id
	LEFT JOIN tbl_type_treasury ON tbl_treasury_acount.type_acount_id_fk=tbl_type_treasury.type_treasury_id
    LEFT JOIN tbl_currency ON  tbl_type_treasury.currency_id_fk = tbl_currency.currencyId
    LEFT JOIN tbl_type_acount ON  tbl_type_treasury.typeId_fk = tbl_type_acount.type_acount_id`;
    const fileds=`ROW_NUMBER() OVER (ORDER BY expenditure_date ASC) AS id,
    tbl_expenditure.*, 
	tbl_treasury_acount.acountName, 
	tbl_treasury_acount.acount_number, 
	tbl_type_icom_expenses.type_code, 
	tbl_type_icom_expenses.in_ex_name,
    tbl_currency.currency, 
	tbl_currency.genus,  
    tbl_currency.genus_laos,
    tbl_type_acount.type_name`;
    const wheres = `statsus_del='1' AND expenditure_date BETWEEN '${startDates}' AND '${endDates}' ${type_expenditure} ${treasuryId_fk} ${statusConfirm} ORDER BY expenditure_date ASC`;
    db.queryConditions(table,fileds, wheres, (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});

router.get('/detail/:id', function (req, res) {
const title_id_fk=req.params.id;
const tables=`tbl_expenditure_list`;
const fileds=`*`;
const wheres = `cost_title_fk='${title_id_fk}'`;
    db.queryConditions(tables,fileds, wheres, (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});

module.exports = router;