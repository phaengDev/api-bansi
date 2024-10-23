const express = require('express');
const router = express.Router();
const db = require('../config/db');

const tables = `tbl_tyle_list`;
router.post("/create", function (req, res) {
    const { type_listId, typeId_fk, type_codelist, type_list_name } = req.body;
    const wheres = `typeId_fk='${typeId_fk}'`;

    const fields = `type_list_id,typeId_fk,code_list,type_list_name,status_del`;
    if(!type_listId){
    db.queryMax(tables, 'code_list',  wheres,type_codelist, (err, code_list) => {

        db.autoId(tables, 'type_list_id', (err, type_list_id) => {
            
            const data = [type_list_id, typeId_fk, code_list, type_list_name,1];


            db.insertData(tables, fields, data, (err, results) => {
                if (err) {
                    return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
                }
                res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
            });
        });
    })
}else{
    const fieldUp = 'typeId_fk,code_list,type_list_name';
    const newData = [typeId_fk,type_codelist, type_list_name,type_listId];
    const condition = 'type_list_id=?';
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
    const tablesList=`tbl_tyle_list
	INNER JOIN tbl_type_group ON  tbl_tyle_list.typeId_fk = tbl_type_group.type_id`;
    const fields=`tbl_tyle_list.type_list_id, 
	tbl_tyle_list.code_list, 
	tbl_tyle_list.type_list_name, 
	tbl_type_group.type_id, 
	tbl_type_group.type_code, 
	tbl_type_group.type_name`;
    const wheres=`status_del='1'`;
    db.queryConditions(tablesList,fields,wheres, (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });

});

router.get("/group", function (req, res) {
    db.queryAll('tbl_type_group', (err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });

})

module.exports = router