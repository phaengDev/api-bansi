const express=require('express');
const router=express.Router();
const db = require('../config/db');

router.get("/", function (req, res) {
    db.queryAll('tbl_currency',(err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});


router.get("v/:id", function (req, res) {
    const id= req.params.id;
    const where=`currencyId=${id}`;
    db.singleAll('tbl_currency', where,(err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});

router.get('/bank', function (req, res) {
    db.queryAll('tbl_banks',(err, results) => {
        if (err) {
            return res.status(400).send('ການສະແດງຂໍ້ມູນລົມເຫຼວ');
        }
        res.status(200).json(results);
    });
});

module.exports=router