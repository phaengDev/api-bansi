const express = require('express');
const router = express.Router();
const db = require('../config/db');

const tables = `tbl_type_treasury`;

router.post("/create", function (req, res) {
    const { type_listId, typeId_fk,currency_id_fk, type_codelist, acount_name } = req.body;
    const wheres = `typeId_fk='${typeId_fk}'`;
    const fields = `type_treasury_id,typeId_fk,currency_id_fk,treasury_code,acount_name,status_del`;
    if(!type_listId){
    db.queryMax(tables, 'treasury_code',  wheres,type_codelist, (err, treasury_code) => {

        db.autoId(tables, 'type_treasury_id', (err, type_treasury_id) => {
        const data = [type_treasury_id, typeId_fk,currency_id_fk, treasury_code, acount_name,1];
            db.insertData(tables, fields, data, (err, results) => {
                if (err) {
                    return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
                }
                res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
            });
        });
    })
}else{
    const fieldUp = 'typeId_fk,currency_id_fk,treasury_code,acount_name';
    const newData = [typeId_fk,currency_id_fk,type_codelist, acount_name,type_listId];
    const condition = 'type_treasury_id=?';
    db.updateData(tables,fieldUp, newData, condition, (err, resultsUp) => {
        if (err) {
            console.error('Error updating data:', err);
            return res.status(500).json({ error: 'ການບັນທຶກຂໍ້ມູນບໍ່ສຳເລັດ' });
        }
        res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ' });
    });
}
})

router.get("/list", function (req, res) {
    const tablesList=`tbl_type_treasury
	LEFT JOIN tbl_type_acount ON  tbl_type_treasury.typeId_fk = tbl_type_acount.type_acount_id
    LEFT JOIN tbl_currency ON tbl_type_treasury.currency_id_fk = tbl_currency.currencyId`;
    const fields=`tbl_type_treasury.type_treasury_id, 
	tbl_type_treasury.treasury_code, 
	tbl_type_treasury.acount_name, 
	tbl_type_acount.type_acount_id, 
	tbl_type_acount.type_code, 
	tbl_type_acount.type_name,
    tbl_type_treasury.currency_id_fk,
    tbl_currency.currency,
    tbl_currency.genus,
    tbl_currency.genus_laos`;
    const wheres=`status_del='1'`;
    db.queryConditions(tablesList,fields,wheres, (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});

router.get("/list/:id", function (req, res) {
    const typeId_fk=req.params.id;
    const tablesList=`tbl_type_treasury
    LEFT JOIN tbl_currency ON tbl_type_treasury.currency_id_fk = tbl_currency.currencyId`;
    const fields=`type_treasury_id, 
	tbl_type_treasury.treasury_code, 
	tbl_type_treasury.acount_name,
    tbl_currency.currency,
    tbl_currency.genus`;
    const wheres=`status_del='1' AND typeId_fk='${typeId_fk}'`;
    db.queryConditions(tablesList,fields,wheres, (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});


router.get("/group", function (req, res) {
    db.queryAll('tbl_type_acount', (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });

});


router.get("/sts", function (req, res) {
    db.queryAll('tbl_statuse', (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });

})

module.exports = router