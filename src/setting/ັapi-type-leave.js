const express=require('express');
const router=express.Router();
const db = require('../config/db');

router.get("/", function (req, res) {
    db.queryAll('tbl_type_leave',(err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});

router.get("/:id", function (req, res) {
    const id= req.params.id;
    const where=`typeId=${id}`;
    db.singleAll('tbl_type_leave', where,(err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});
module.exports=router