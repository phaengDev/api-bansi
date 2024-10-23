const express=require('express');
const router=express.Router();
const db = require('../config/db');
router.post("/create", function (req, res) {
    const {departId,depart_name,depart_reamrk} = req.body;
    const table = 'tbl_department';
    if(departId===''){
        db.autoId(table, 'department_id', (err, department_id) => {
    const fields = 'department_id, depart_name,depart_reamrk';
    const data = [department_id, depart_name,depart_reamrk];
    db.insertData(table, fields, data, (err, results) => {
        if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ`  });
        }
        console.log('Data inserted successfully:', results);
        res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
    });
});
}else{
    const field = 'depart_name,depart_reamrk';
    const newData = [depart_name,depart_reamrk,departId]; 
    const condition = 'department_id=?'; 
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
    const department_id= req.params.id;
    const where=`department_id='${department_id}'`;
    db.deleteData('tbl_department', where, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'ຂໍອະໄພການລືບຂໍ້ມູນບໍ່ສຳເລັດ' });
        }
        res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
    });
    });

    router.get("/", function (req, res) {
        const tables=`tbl_department`;
        db.queryAll(tables, (err, results) => {
            if (err) {
                return res.status(400).send();
            }
            res.status(200).json(results);
        });
        });

module.exports = router;