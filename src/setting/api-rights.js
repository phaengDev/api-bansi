const express=require('express');
const router=express.Router();
const db = require('../config/db');

router.get("/", function (req, res) {
    db.queryAll('tbl_rights_use',(err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});
router.get("/:id", function (req, res) {
    const id= req.params.id;
    const where=`rightsId=${id}`;
    db.singleAll('tbl_rights_use', where,(err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});
module.exports=router