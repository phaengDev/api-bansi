const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
router.post("/create", function (req, res) {
    const { treasuryId, type_acount_id_fk,acountName, acount_number, bank_id_fk,  balance_treasury, balance_unable,status_use,userId } = req.body;
    const balanceTreasury = Math.round(parseFloat(balance_treasury.replace(/,/g, '')));
    const balanceUnable = Math.round(parseFloat(balance_unable.replace(/,/g, '')));
    const tables = 'tbl_treasury_acount';
    if (treasuryId === '') {
        db.autoId(tables, 'treasury_id', (err, treasury_id) => {
            const fields = 'treasury_id, type_acount_id_fk,acountName,acount_number,bank_id_fk,balance_treasury,balance_unable,status_use';
            const data = [treasury_id, type_acount_id_fk,acountName, acount_number, bank_id_fk,  balanceTreasury, balanceUnable, status_use];
            db.insertData(tables, fields, data, (err, results) => {
                if (err) {
                    // console.error('Error inserting data:', err);
                    return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
                }
                // console.log('Data inserted successfully:', results);
                res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
            });
        });
    } else {
        const whereck = `treasury_id='${treasuryId}'`;
        db.fetchSingleAll(tables, whereck, (err, resp) => {
            if (err) {
                console.error('Error selecting data:', err);
                return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
            }
        
        const fieldsedit = 'treasury_id,type_acount_id_fk,acountName,acount_number,bank_id_fk,balance_treasury,balance_unable,balance_new,user_edit_fk,date_edit';
        const dataedit = [
            uuidv4(),
            resp.type_acount_id_fk,
            resp.acountName,
            resp.acount_number,
            resp.bank_id_fk,
            resp.balance_treasury,
            resp.balance_unable,
            balanceTreasury,
            userId,
            dateTime
        ];
        db.insertData('tbl_treasury_acount_edit', fieldsedit, dataedit, (err, results) => {
            if (err) {
                // console.error('Error inserting data:', err);
                return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
            }

        const field = 'type_acount_id_fk,acountName,acount_number,bank_id_fk,balance_treasury,balance_unable,status_use';
        const newData = [type_acount_id_fk,acountName, acount_number, bank_id_fk,  balanceTreasury, balanceUnable,status_use, treasuryId];
        const condition = 'treasury_id=?';
        db.updateData(tables, field, newData, condition, (err, results) => {
            if (err) {
                console.error('Error updating data:', err);
                return res.status(500).json({ error: 'ແກ້ໄຂຂໍ້ມູນບໍ່ສຳເລັດ ກະລຸນາກວອສອນແລ້ວລອງໃໝ່ອິກຄັ້ງ' });
            }
            console.log('Data updated successfully:', results);
            res.status(200).json({ message: 'ການແກ້ໄຂຂໍ້ມູນສຳເລັດ', data: results });
        });
    });
});
    }
});

router.delete("/:id", function (req, res, next) {
    const treasury_id = req.params.id;
    const where = `treasury_id='${treasury_id}'`;
    db.deleteData('tbl_treasury_acount', where, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'ຂໍອະໄພການລືບຂໍ້ມູນບໍ່ສຳເລັດ' });
        }
        res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
    });
});




router.get("/type/:id", function (req, res) {
    const typeId_fk=req.params.id;
    const tables = `tbl_treasury_acount
	LEFT JOIN tbl_type_treasury ON  tbl_treasury_acount.type_acount_id_fk = tbl_type_treasury.type_treasury_id
    LEFT JOIN tbl_currency ON tbl_type_treasury.currency_id_fk = tbl_currency.currencyId`;
    const fields=`tbl_treasury_acount.treasury_id, 
	tbl_treasury_acount.type_acount_id_fk, 
	tbl_treasury_acount.acountName, 
	tbl_treasury_acount.acount_number,
    tbl_type_treasury.acount_name,
    tbl_currency.currency,
    tbl_currency.genus,
    tbl_currency.genus_laos`;
    const wheres=`typeId_fk='${typeId_fk}' AND status_use='1'`;
    db.queryConditions(tables,fields,wheres, (err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});


router.get("/", function (req, res) {
    const tables = `tbl_treasury_acount
	LEFT JOIN tbl_banks ON tbl_treasury_acount.bank_id_fk = tbl_banks.bankId
	LEFT JOIN tbl_type_treasury ON  tbl_treasury_acount.type_acount_id_fk = tbl_type_treasury.type_treasury_id
	LEFT JOIN tbl_currency ON tbl_type_treasury.currency_id_fk = tbl_currency.currencyId
	LEFT JOIN tbl_type_acount ON tbl_type_treasury.typeId_fk = tbl_type_acount.type_acount_id`;
    const fields=`tbl_treasury_acount.treasury_id, 
	tbl_treasury_acount.type_acount_id_fk, 
	tbl_treasury_acount.acountName, 
	tbl_treasury_acount.acount_number, 
	tbl_treasury_acount.bank_id_fk, 
	tbl_type_treasury.currency_id_fk, 
	tbl_treasury_acount.balance_treasury, 
	tbl_treasury_acount.balance_unable, 
	tbl_treasury_acount.status_use, 
	tbl_currency.currency, 
	tbl_currency.icons, 
	tbl_currency.genus, 
	tbl_currency.genus_laos, 
	tbl_banks.bankName, 
    tbl_type_treasury.type_treasury_id,
	tbl_type_treasury.typeId_fk, 
	tbl_type_treasury.treasury_code, 
	tbl_type_treasury.acount_name, 
	tbl_type_acount.type_code, 
	tbl_type_acount.type_name`;
    const wheres=`status_use='1'`;
    db.queryConditions(tables,fields,wheres, (err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});

module.exports = router;